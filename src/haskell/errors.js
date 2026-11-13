// The one error type every stage throws: kind says which stage, line where in the program.

class HsError extends Error { constructor(msg, kind = 'runtime', line = null) { super(msg); this.kind = kind; this.line = line; } }

export { HsError };
