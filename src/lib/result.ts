export type Ok<T> = {
	ok: true;
	value: T;
};
export type Err<E> = {
	ok: false;
	error: E;
};
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => {
	return { ok: true, value };
};
export const err = <E>(error: E): Err<E> => {
	// console.error(error);
	return { ok: false, error };
};
export const expect = <T, E>(v: Result<T, E>, msg: string = 'expected result to not be error:') => {
	if (v.ok) {
		return v.value;
	}
	throw `${msg} ${v.error}`;
};
export const map = <T, E, U>(v: Result<T, E>, fn: (value: T) => U): Result<U, E> => {
	if (v.ok) {
		return ok(fn(v.value));
	}
	return err(v.error);
};

export type OkType<R> = R extends { ok: true; value: infer T } ? T : never;
export type ErrType<R> = R extends { ok: false; error: infer E } ? E : never;
