import { isReportWorkType, type ReportWorkType } from './pricing';

const REPORT_WORK_TYPE: Record<string, ReportWorkType> = {
  seminar: 'seminarski', final: 'zavrsni', graduate: 'diplomski', specialist: 'diplomski',
  doctoral: 'doktorski', article: 'zavrsni', project: 'zavrsni',
};

export function toReportWorkType(workType: string): ReportWorkType {
  return isReportWorkType(workType) ? workType : (REPORT_WORK_TYPE[workType] ?? 'zavrsni');
}
