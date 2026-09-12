import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";

/* המטרה כאן צרה: לתפוס שבירות אמיתיות לפני שהן מגיעות לשיעור.
   שני באגים הגיעו עד הדפדפן ועברו גם את הבנייה וגם את הבדיקות —
   משתנה בשימוש בלי ייבוא, ומשתנה שנקרא לפני שהוגדר. אלה errors.
   כללי סגנון של הוקים נשארים warnings: הם שווים קריאה, אבל לא
   צריכים לעצור פרסום. */
export default [
  { ignores: ["dist/**", "node_modules/**", "*.tmp.mjs"] },
  js.configs.recommended,
  {
    files: ["*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: "18.3" } },
    plugins: { react, "react-hooks": hooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...hooks.configs.recommended.rules,
      "no-undef": "error",
      "no-use-before-define": ["error", { functions: false, variables: true, classes: true }],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // catch ריק הוא מכוון: localStorage חסום בגלישה פרטית ואסור שיפיל את האפליקציה
      "no-empty": ["error", { allowEmptyCatch: true }],
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react/prop-types": "off",
    },
  },
  {
    files: ["src/**/*.test.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  /* בדיקות שרצות בדפדפן דרך playwright: קוד Node שמריץ, ובתוכו קטעים
     שמוערכים בדף עצמו — ולכן שתי מערכות הגלובלים. */
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
