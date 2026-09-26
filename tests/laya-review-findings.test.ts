import { describe, it } from 'vitest';
import { reviewCases } from './helpers/laya-review-cases';
describe('Laya review regressions - bez modela',()=>{for(const test of reviewCases)it(test.name,test.run)});
