// Entry point: load the styles, wire up the game, show the welcome screen once.
import './styles.css';
import { $, save, state } from './game/state.js';
import { initTown, plotLabel } from './game/town.js';
import { initSidebar, renderSidebar } from './game/sidebar.js';
import { initNotebook } from './game/notebook.js';

initTown();
initSidebar();
initNotebook();

$('#welcomeGo').onclick = () => { state.welcomed = true; save(); $('#welcome').hidden = true; document.body.classList.remove('modal-open'); };
if (!state.welcomed) { $('#welcome').hidden = false; document.body.classList.add('modal-open'); }
renderSidebar();
$('#hoverLabel').innerHTML = plotLabel(null);
