import * as AST from "@babel/types"
import { expect, test } from '@jest/globals'
import * as tested from '../test-typechecker'
import * as types from '../../../src/transpiler/types'
import * as names from '../../../src/transpiler/names'
// import * as clazz from '../../../src/transpiler/classes'

test('optional type', () => {
    const src = 'let a: integer | undefined'
    const ast = tested.transpile(src)
    const table = names.getNameTable(ast.program)
    const type2 = table?.lookup('a')?.type
    expect((type2 as types.OptionalType).elementType).toBe(types.Integer)
})

test('optional types', () => {
    const src = `let a: integer | undefined
    let b: integer | null
    let c: undefined | integer
    let d: null | integer`

    const ast = tested.transpile(src)
    const table = names.getNameTable(ast.program)

    const type = table?.lookup('a')?.type
    expect((type as types.OptionalType).elementType).toBe(types.Integer)

    const type2 = table?.lookup('b')?.type
    expect((type2 as types.OptionalType).elementType).toBe(types.Integer)

    const type3 = table?.lookup('c')?.type
    expect((type3 as types.OptionalType).elementType).toBe(types.Integer)

    const type4 = table?.lookup('d')?.type
    expect((type4 as types.OptionalType).elementType).toBe(types.Integer)
})

test('bad syntax', () => {
    const src = `const a: integer | string = 0`
    expect(() => tested.transpile(src)).toThrow(/line 1 \(column 9\)/)

    const src2 = `const a: undefined | null = undefined`
    expect(() => tested.transpile(src2)).toThrow(/line 1 \(column 9\)/)

    const src3 = `const a: integer | string | undefined = undefined`
    expect(() => tested.transpile(src3)).toThrow(/line 1 \(column 9\)/)

    const src4 = `const a: integer | undefined | undefined = undefined`
    expect(() => tested.transpile(src4)).toThrow(/line 1 \(column 9\)/)

    const src5 = `const a: undefined | integer | undefined = undefined`
    expect(() => tested.transpile(src5)).toThrow(/line 1 \(column 9\)/)

    const src6 = `const a: undefined | undefined | integer = undefined`
    expect(() => tested.transpile(src6)).toThrow(/line 1 \(column 9\)/)

    const src7 = `const a: (integer | undefined) | undefined = undefined`
    expect(() => tested.transpile(src7)).toThrow(/line 1 \(column 9\)/)

    const src8 = `const a: any | undefined = undefined`
    expect(() => tested.transpile(src8)).toThrow(/line 1 \(column 9\)/)
})

test('initialize', () => {
    const src = `let a: integer | undefined = undefined
    let b: integer | undefined = 0
    let c: string | undefined = undefined
    let d: string | undefined = ""
    // CHECKIT: should I allow optional function type?
    // let e: ((x: integer) => integer) | undefined = undefined
    // let f: ((x: integer) => integer) | undefined = (x: integer): integer => x`

    const ast = tested.transpile(src)
    const table = names.getNameTable(ast.program)

    const checkDecl = (decl: AST.VariableDeclaration, expectedLType: types.StaticType, expectedRType: types.StaticType) => {
        const vardecl = decl.declarations[0]

        const varName = (vardecl.id as AST.Identifier).name
        const ltype = table?.lookup(varName)?.type
        expect((ltype as types.OptionalType).elementType).toBe(expectedLType)

        const init = vardecl.init
        const rtype = names.getStaticType(init as AST.Node)
        expect(rtype).toBe(expectedRType)    
    }

    checkDecl(ast.program.body[0] as AST.VariableDeclaration, types.Integer, types.Null)
    checkDecl(ast.program.body[1] as AST.VariableDeclaration, types.Integer, types.Integer)
    checkDecl(ast.program.body[2] as AST.VariableDeclaration, types.StringT, types.Null)
    checkDecl(ast.program.body[3] as AST.VariableDeclaration, types.StringT, types.StringT)
})

test('assignment', () => {
    const src = `let a: integer | undefined
    a = undefined
    a = 0
    const b: integer = 0
    a = b
    const c: undefined = undefined
    a = c
    const d: integer | undefined = 0
    a = d
    const e: (x: integer | undefined) => integer = (x) => 0
    a = e(a)`

    const ast = tested.transpile(src)
    const table = names.getNameTable(ast.program)

    const checkAssignment = (assignment: AST.AssignmentExpression, expectedLType: types.StaticType, expectedRType: types.StaticType) => {
        const varName = (assignment.left as AST.Identifier).name
        const ltype = table?.lookup(varName)?.type
        expect((ltype as types.OptionalType).elementType).toBe(expectedLType)

        const rtype = names.getStaticType(assignment.right as AST.Node)
        expect(rtype).toBe(expectedRType)
    }

    checkAssignment((ast.program.body[1] as AST.ExpressionStatement).expression as AST.AssignmentExpression, types.Integer, types.Null)
    checkAssignment((ast.program.body[2] as AST.ExpressionStatement).expression as AST.AssignmentExpression, types.Integer, types.Integer)
    checkAssignment((ast.program.body[4] as AST.ExpressionStatement).expression as AST.AssignmentExpression, types.Integer, types.Integer)
    checkAssignment((ast.program.body[6] as AST.ExpressionStatement).expression as AST.AssignmentExpression, types.Integer, types.Null)
    // checkAssignment((ast.program.body[8] as AST.ExpressionStatement).expression as AST.AssignmentExpression, types.Integer, new types.OptionalType(types.Integer))
    // checkAssignment((ast.program.body[10] as AST.ExpressionStatement).expression as AST.AssignmentExpression, types.Integer, types.Integer)
})

test('optional types are flow-sensitive', () => {
    const src = `const foo = (x: integer | undefined) => {
        if (x != undefined) {
            const y: integer = x
        } else {
            const y: undefined = x
        }
    }
    const foo2 = (x: integer | undefined) => {
        if (x == undefined) {
            const y: undefined = x
        } else {
            const y: integer = x
        }
    }
    const foo3 = (x: integer | undefined): integer => {
        while (x != undefined) {
            const y: integer = x
        }
    }
    const foo4 = (x: integer | undefined): integer => {
        while (x == undefined) {
            const y: undefined = x
        }
    }
    const foo5 = (x: integer | undefined): integer => {
        for (let i = 0; x != undefined; i++) {
            const y: integer = x
        }
    }`
    const ast = tested.transpile(src)
    const table = names.getNameTable(ast.program)
    for (const fname of ['foo', 'foo2', 'foo3', 'foo4', 'foo5']) {
        const type = table?.lookup(fname)?.type
        expect(((type as types.FunctionType).paramTypes[0] as types.OptionalType).elementType).toBe(types.Integer)
        expect((type as types.FunctionType).returnType).toBe(types.Integer)
    }
})

test('optional types are flow-sensitive (negative cases)', () => {
    const src = `const foo = (x: integer | undefined) => {
        if (x == undefined) x = 0
        const y: integer = x
    }`
    expect(() => tested.transpile(src)).toThrow(/line 3 \(column 14\)/)

    const src2 = `const foo = (x: integer | undefined) => {
        return
        const y: integer = x
    }`
    expect(() => tested.transpile(src2)).toThrow(/line 3 \(column 14\)/)
})

test('assigning undefined discards context', () => {
    const src = `const foo = (x: integer | undefined) => {
        if (x != undefined) {
            const y: integer = x
            x = undefined
        }
    }`
    expect(() => tested.transpile(src)).toThrow(/line 3 \(column 14\)/)
})

test('assigning an optional value discards context', () => {
    const src = `const Z: integer | undefined = 0
    const foo = (x: integer | undefined) => {
        if (x != undefined) {
            const y: integer = x
            x = Z
        }
    }`
    expect(() => tested.transpile(src)).toThrow(/line 3 \(column 14\)/)
})
