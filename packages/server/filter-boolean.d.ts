interface Array<T> {
    filter<S extends T>(
      predicate: BooleanConstructor,
      thisArg?: any,
    ): TSReset.NonFalsy<S>[];
  }
  
  interface ReadonlyArray<T> {
    filter<S extends T>(
      predicate: BooleanConstructor,
      thisArg?: any,
    ): TSReset.NonFalsy<S>[];
  }