const state = document.querySelector("#state");
const details = document.querySelector("#details");

async function showResult(result) {
  if (!result.ok) {
    state.textContent = `Operation failed: ${result.error.code}`;
    details.textContent = result.error.message;
    return;
  }
  state.textContent = result.value.core
    ? `Core: ${result.value.core.state} · Policy applied: ${result.value.core.policyApplied}`
    : `Policy configured: ${result.value.configured}`;
  details.textContent = JSON.stringify(result.value, null, 2);
}

async function refresh() {
  await showResult(await window.localWorkspace.app.getStatus());
}

document.querySelector("#refresh").addEventListener("click", refresh);
document.querySelector("#start").addEventListener("click", async () => {
  await showResult(await window.localWorkspace.core.start());
});
document.querySelector("#stop").addEventListener("click", async () => {
  await showResult(await window.localWorkspace.core.stop());
});

void refresh();
