import '@fontsource-variable/inter-tight';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../../shared/design-system.css';
import { mountRouteShell } from '../shared/route-shell';
import { renderWorkspaceBootError, renderWorkspaceShell } from './workspace-shell';
import './workspace.css';

mountRouteShell(document, {
  current: 'workspace',
  variant: 'workspace',
  privacySettingsAvailable: true,
});
renderWorkspaceShell(document);

void import('./workspace-runtime')
  .then(({ mountWorkspaceRuntime }) => mountWorkspaceRuntime(document))
  .catch(() => renderWorkspaceBootError(
    document,
    'Dokument nije izgubljen s uređaja. Vrati se na početnu stranicu i ponovno ga odaberi.',
  ));
