import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(root, 'src', 'index.template.html');
const componentsPath = path.join(root, 'src', 'components');
const outputPath = path.join(root, 'index.html');
const components = [
  { name: 'account-creation', start: '<div class="account-backdrop"', end: '<section class="hero">' },
  { name: 'start-project', start: '<section class="hero">', end: '<section class="services"' },
  { name: 'services', start: '<section class="services"', end: '<section class="work"' },
  { name: 'work', start: '<section class="work"', end: '<section class="about"' },
  { name: 'about', start: '<section class="about"', end: '<section class="contact"' },
  { name: 'contact', start: '<section class="contact"', end: '<footer>' },
];

function initializeComponents() {
  if (fs.existsSync(templatePath)) {
    throw new Error('Components are already initialized. Run `node build.mjs` to rebuild index.html.');
  }

  let template = fs.readFileSync(outputPath, 'utf8');
  for (const component of components) {
    const start = template.indexOf(component.start);
    const end = template.indexOf(component.end, start + component.start.length);
    if (start < 0 || end < 0) {
      throw new Error(`Could not find the ${component.name} section in index.html.`);
    }

    const markup = template.slice(start, end).trim();
    const componentDirectory = path.join(componentsPath, component.name);
    fs.mkdirSync(componentDirectory, { recursive: true });
    fs.writeFileSync(path.join(componentDirectory, 'index.html'), `${markup}\n`);
    template = `${template.slice(0, start)}<!-- include:${component.name} -->${template.slice(end)}`;
  }

  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  fs.writeFileSync(templatePath, template);
}

function buildPage() {
  if (!fs.existsSync(templatePath)) {
    throw new Error('Run `node build.mjs --init` once to create the component folders.');
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  let page = template.replace(/<!-- include:([a-z-]+) -->/g, (placeholder, name) => {
    const componentPath = path.join(componentsPath, name, 'index.html');
    if (!fs.existsSync(componentPath)) throw new Error(`Missing component: ${name}`);
    return fs.readFileSync(componentPath, 'utf8').trim();
  });
  if (page.includes('<!-- include:')) throw new Error('An unresolved component placeholder remains.');

  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
    if (process.env[name]) {
      const declaration = new RegExp(`const ${name} = '[^']*';`);
      if (!declaration.test(page)) throw new Error(`Could not find ${name} in the page template.`);
      page = page.replace(declaration, `const ${name} = ${JSON.stringify(process.env[name])};`);
    }
  }

  fs.writeFileSync(outputPath, page);
  console.log('Built index.html from src/components/.');
}

if (process.argv.includes('--init')) initializeComponents();
buildPage();