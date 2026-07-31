/**
 * Command-line flags shared by every game.
 *
 * Kept tiny and dependency-free — a game launched with `npx` should start, not
 * parse an options grammar.
 */

export const FLAG_HELP = `
  --mono, --no-color   play in monochrome
  --color              force color on
  --theme <name>       felt | paper | noir
  --help               show this
`;

/**
 * @param {string[]} [argv]
 * @returns {{mono:boolean|null, theme:string|null, help:boolean, rest:string[]}}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { mono: null, theme: null, help: false, rest: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--mono' || arg === '--monochrome' || arg === '--no-color') {
      out.mono = true;
    } else if (arg === '--color' || arg === '--colour') {
      out.mono = false;
    } else if (arg === '--theme') {
      out.theme = argv[++i] ?? null;
    } else if (arg.startsWith('--theme=')) {
      out.theme = arg.slice('--theme='.length);
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else {
      out.rest.push(arg);
    }
  }

  return out;
}
