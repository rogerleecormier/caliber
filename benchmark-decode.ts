import { decodeHtmlEntities } from './src/lib/html-utils';

const start = performance.now();
for (let i = 0; i < 100; i++) {
  decodeHtmlEntities("Software Engineer &amp; Developer");
}
const end = performance.now();
console.log(`100 calls took ${end - start}ms`);
console.log(`Average: ${(end - start) / 100}ms`);
