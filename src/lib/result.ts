export type Result<T, E> =
	| {
			ok: true;
			value: T;
	  }
	| {
			ok: false;
			error: E;
	  };

export const ok = <T, E>(value: T): Result<T, E> => {
	return { ok: true, value };
};
export const err = <T, E>(error: E): Result<T, E> => {
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
