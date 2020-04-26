// Some typescript voodoo

// Takes all the arguments except the first one
export type Cdr<Fn> = Fn extends (arg: infer First, ...args: infer Tail) =>
  infer Ret ? (...args: Tail) => Ret : never;

// Takes the first argument type
export type Car<Fn> = Fn extends (arg: infer First, ...args: infer Tail) =>
  infer Ret ? First : never;
export type Cons<Arg, Fn> = Fn extends (...args: infer Args) => infer Ret ?
    (arg: Arg, ...args: Args) => Ret : never;

// Checks whether if Fn is a function
export type IsFn<Fn> =
  Fn extends (...args: infer Args) => infer Ret ? true : false;
// Checks if Fn is a no paramter function
export type IsNoParam<Fn> =
  Fn extends () => infer Ret ? true : false;
// Checks if Fn is a one paramter function
export type IsOneParam<Fn> =
  Fn extends (arg: infer Arg) => infer Ret ? true : false;
// Gets the return value type of this function
export type RetType<Fn> =
  Fn extends (...args: infer Args) => infer Ret ? Ret : never;
// Sets the return value type of this function
export type SetRetType<Fn, NewRet> =
  Fn extends (...args: infer Args) => infer Ret ?
    (...args: Args) => NewRet : never;

// Ensures that the function has a fixed number of parameters
type IsConcrete<Fn> = {
  'True': true;
  'Next': IsConcrete<Cdr<Fn>>;
  'False': false;
}[
  Fn extends (...args: infer Args) => infer Ret ? (
    IsNoParam<Fn> extends true ?
      'True' // base case, reached end of list
    : Parameters<Fn> extends (infer Params)[] ?
      (Params[] extends Parameters<Fn> ?
        'False'
      : 'Next')
    : 'Next')
  : 'False'
];

// Extracts the callback return value
export type CallbackRet<Fn> = {
  base: Car<Cdr<Car<Fn>>>;
  next: CallbackRet<Cdr<Fn>>;
  error: never;
}[
  IsConcrete<Fn> extends false ?
    'error'
  : IsNoParam<Fn> extends true ?
    'error'
  : IsOneParam<Fn> extends true ?
    'base'
  :
    'next'
]

type _Reverse<Fn, Accum = () => void> = {
  base: Accum;
  error: never;
  next: _Reverse<Cdr<Fn>, Cons<Car<Fn>, Accum>>;
}[
  IsConcrete<Fn> extends false ?
    'error'
  : IsNoParam<Fn> extends true ?
    'base'
  :
    'next'
];

// Reverses all the parameters of a function
export type Reverse<Fn> = _Reverse<Fn, () => RetType<Fn>>;
