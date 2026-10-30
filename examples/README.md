# examples/

`hello.json` is a fixture screen. It compiles and lints against `examples/catalog/`, a tiny fake
catalog whose component and variable keys resolve to nothing in Figma. That is the point: it proves
the compiler and the gate on a fresh clone, before you have a design system of your own.

Real building starts after **Extract components & tokens** has written your catalog to `ds/`. Do not
copy this screen into `screens/`: it points at the fixture, so its components would not exist in
your file.

- `examples/hello.json` — the screen. Read it to see the shape of a tree.
- `examples/catalog/` — the fixture catalog: components, variable keys, text styles.
- `examples/hello.test.mjs` — fails if the fixture and the screen drift apart.

Run the pair:

```sh
node --test examples/hello.test.mjs
node scripts/lint.mjs examples/hello.json
```
