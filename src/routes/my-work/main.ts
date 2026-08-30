import '@fontsource-variable/inter-tight';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../../shared/design-system.css';
import { mountRouteShell } from '../shared/route-shell';
import './my-work.css';

mountRouteShell(document, {
  current: 'my-work',
  variant: 'my-work',
  privacySettingsAvailable: false,
});
