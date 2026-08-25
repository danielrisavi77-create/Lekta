import { mountRouteShell } from '../shared/route-shell';
import { renderWorkspaceBootError, renderWorkspaceShell } from './workspace-shell';
import './workspace.css';

mountRouteShell(document, { current: 'workspace' });
renderWorkspaceShell(document);

void import('./workspace-runtime')
  .then(({ mountWorkspaceRuntime }) => mountWorkspaceRuntime(document))
  .catch(() => renderWorkspaceBootError(
    document,
    'Dokument nije izgubljen s uređaja. Vrati se na početnu stranicu i ponovno ga odaberi.',
  ));
