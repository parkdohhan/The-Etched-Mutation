// Rough LBW word counter: body text excluding references, floats (tables/figures/equations) counted separately.
import fs from 'node:fs';

let t = fs.readFileSync('main.tex', 'utf8').replace(/%[^\n]*/g, '');
t = t.slice(t.indexOf('\\begin{document}'), t.indexOf('\\bibliographystyle'));

const caps = [...t.matchAll(/\\caption\{([^}]*)\}/g)].map(m => m[1]).join(' ');
const argCmds = /\\(cite|ref|label|includegraphics|keywords|titlerunning|authorrunning|institute|author)(\[[^\]]*\])?\{[^}]*\}/g;
const anyCmd = /\\[a-zA-Z]+\*?(\[[^\]]*\])?/g;

const clean = s => s.replace(argCmds, ' ').replace(anyCmd, ' ').replace(/[{}$&~]/g, ' ').replace(/---?/g, ' ');
const words = s => clean(s).split(/\s+/).filter(x => /[A-Za-z0-9]/.test(x)).length;

const noFloats = t.replace(/\\begin\{(equation|table|figure)\}[\s\S]*?\\end\{\1\}/g, ' ');
const abstract = (t.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/) || ['', ''])[1];
const tables = [...t.matchAll(/\\begin\{table\}[\s\S]*?\\end\{table\}/g)].map(m => m[0]).join(' ');

console.log('abstract                 :', words(abstract));
console.log('body excl. floats (+abs) :', words(noFloats));
console.log('captions                 :', words(caps));
console.log('table cells              :', words(tables) - words(caps.split(' ').length ? tables.match(/\\caption\{[^}]*\}/g)?.join(' ') ?? '' : ''));
console.log('body + captions          :', words(noFloats) + words(caps));
