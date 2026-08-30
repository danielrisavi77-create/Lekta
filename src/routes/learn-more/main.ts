import '@fontsource-variable/inter-tight';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../../shared/design-system.css';
import { mountRouteShell } from '../shared/route-shell';
import './learn-more.css';

mountRouteShell(document, {
  current: 'learn-more',
  variant: 'content',
  privacySettingsAvailable: true,
});

void Promise.all([
  import('../../shared/ui-boot'),
  import('../../ui/korektorski'),
  import('../../ui/hero-demo'),
  import('../../ui/app'),
]).then(([, , , { initAnalyzerApp }]) => initAnalyzerApp(document));
