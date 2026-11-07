// Minimal JSON Schema validator (draft-07 subset) shared by the browser (import, NFR-PRV-05)
// and tools/validate-data.mjs. Supports: type, required, properties, additionalProperties, items,
// enum, const, pattern, minimum, maximum, minItems, maxItems, minLength, oneOf, anyOf, $ref (#/definitions/…).
export function validate(schema, data, root = schema, path = '$', errors = []) {
  if (schema.$ref) {
    const m = /^#\/definitions\/(.+)$/.exec(schema.$ref);
    if (!m || !root.definitions?.[m[1]]) { errors.push(`${path}: unknown $ref ${schema.$ref}`); return errors; }
    return validate(root.definitions[m[1]], data, root, path, errors);
  }
  const t = schema.type;
  if (t) {
    const types = Array.isArray(t) ? t : [t];
    const ok = types.some(x => x === 'integer' ? Number.isInteger(data) : x === 'array' ? Array.isArray(data) : x === 'null' ? data === null : x === 'object' ? data !== null && typeof data === 'object' && !Array.isArray(data) : typeof data === x);
    if (!ok) { errors.push(`${path}: expected ${types.join('|')}`); return errors; }
  }
  if ('const' in schema && data !== schema.const) errors.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(data)) errors.push(`${path}: not one of ${schema.enum.join(', ')}`);
  if (typeof data === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(data)) errors.push(`${path}: does not match ${schema.pattern}`);
    if (schema.minLength != null && data.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
  }
  if (typeof data === 'number') {
    if (schema.minimum != null && data < schema.minimum) errors.push(`${path}: < ${schema.minimum}`);
    if (schema.maximum != null && data > schema.maximum) errors.push(`${path}: > ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) errors.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems != null && data.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) data.forEach((x, i) => validate(Array.isArray(schema.items) ? schema.items[i] || {} : schema.items, x, root, `${path}[${i}]`, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const k of schema.required || []) if (!(k in data)) errors.push(`${path}: missing ${k}`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(data)) {
      if (props[k]) validate(props[k], v, root, `${path}.${k}`, errors);
      else if (schema.patternProperties) { const pp = Object.entries(schema.patternProperties).find(([re]) => new RegExp(re, 'u').test(k)); if (pp) validate(pp[1], v, root, `${path}.${k}`, errors); else if (schema.additionalProperties === false) errors.push(`${path}: unexpected ${k}`); }
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected ${k}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validate(schema.additionalProperties, v, root, `${path}.${k}`, errors);
    }
  }
  if (schema.oneOf) { const n = schema.oneOf.filter(s => validate(s, data, root, path, []).length === 0).length; if (n !== 1) errors.push(`${path}: matches ${n} of oneOf`); }
  if (schema.anyOf && !schema.anyOf.some(s => validate(s, data, root, path, []).length === 0)) errors.push(`${path}: matches none of anyOf`);
  return errors;
}
