import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "coverage/**", ".stockbox-diagnostics/**", "src/data/security-master/*.generated.json", "tmp_*", "tests/tmp-*"] },
  ...nextVitals,
  ...nextTs
];

export default eslintConfig;
