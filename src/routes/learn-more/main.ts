import { mountRouteShell } from '../shared/route-shell';
import './learn-more.css';

mountRouteShell(document, { current: 'learn-more' });

void Promise.all([
  import('../../shared/ui-boot'),
  import('../../ui/korektorski'),
  import('../../ui/hero-demo'),
  import('../../ui/app'),
]).then(([, , , { initAnalyzerApp }]) => initAnalyzerApp(document));
