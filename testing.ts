export {
  assertEquals,
  assertThrows,
  assertThrowsAsync,
  assertStrContains,
  assertArrayContains,
  assertMatch,
  assert,
} from "https://deno.land/std@v0.40.0/testing/asserts.ts";
export const { test } = Deno;

export type MockImplementation = (...args: any[]) => any;
export interface Mock {
  (...args: any[]): any;
  mockCalls: any[][];
  mockImplementation(impl: MockImplementation): Mock;
  mockReset(): void;
}

function notImplemented() {
  throw new Error("Not implemented");
}

export function createMock(impl?: MockImplementation): Mock {
  const fn = (...args: any[]) => {
    mockCalls.push(args);
    return implementation(...args);
  };

  let implementation: MockImplementation = impl || notImplemented;

  const mockCalls: any[][] = [];

  function mockImplementation(impl: MockImplementation) {
    implementation = impl;
    return mock;
  }

  function mockReset() {
    mockCalls.splice(0, mockCalls.length);
  }

  const mock = Object.assign(
    fn,
    { mockCalls, mockReset, mockImplementation },
  );

  return mock;
}

export function arrayOf(...a: number[]) {
  return new Uint8Array(a);
}

export function bufferOf(...a: number[]) {
  return new Deno.Buffer(arrayOf(...a));
}

export interface ResolvablePromise<T> extends PromiseLike<T> {
  resolve: (value: T) => PromiseLike<T>;
  reject: (reason: any) => void;
}

export function createResolvable<T>(): ResolvablePromise<T> {
  const fns: any = {};
  const promise = new Promise<T>((res, rej): void => {
    fns.resolve = res;
    fns.reject = rej;
  });

  const then = promise.then.bind(promise);
  return {
    then,
    resolve(value: T) {
      fns.resolve(value);
      return promise;
    },
    reject(reason: any) {
      fns.reject(reason);
    },
  };
}
