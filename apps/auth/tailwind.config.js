const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');
const { join } = require('path');
const forms = require('@tailwindcss/forms');
const containerQueries = require('@tailwindcss/container-queries');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'selector',
  content: [
    join(
      __dirname,
      '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'
    ),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {},
  },
  plugins: [
    forms({ strategy: "class" }),
    containerQueries
  ],
};
