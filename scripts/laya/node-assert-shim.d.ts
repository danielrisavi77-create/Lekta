// Compile-time shim samo za Laya test helpere; runtime koristi stvarni node:assert/strict.
declare const assert: any;
export default assert;
