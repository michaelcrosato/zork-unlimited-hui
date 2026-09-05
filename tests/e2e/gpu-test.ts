import { test as base, expect } from "@playwright/test";

interface ShaderCheck { label: string; errors: string[] }
declare global {
  interface Window {
    __gpuAudit?: { pending: Promise<void>[]; shaders: ShaderCheck[]; errors: string[] };
  }
}

/** Compile diagnostics and device validation are asynchronous, independent of RAF. */
export const test = base.extend<{ gpuAudit: void }>({
  gpuAudit: [async ({ page }, use, testInfo) => {
    await page.addInitScript(() => {
      const audit = window.__gpuAudit = { pending: [] as Promise<void>[], shaders: [] as ShaderCheck[], errors: [] as string[] };
      if (typeof GPUAdapter === "undefined" || typeof GPUDevice === "undefined") return;
      const requestDevice = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (descriptor) {
        const device = await requestDevice.call(this, descriptor);
        device.addEventListener("uncapturederror", event => {
          if (!audit.errors.includes(event.error.message)) audit.errors.push(event.error.message);
        });
        return device;
      };
      const createShaderModule = GPUDevice.prototype.createShaderModule;
      GPUDevice.prototype.createShaderModule = function (descriptor) {
        const module = createShaderModule.call(this, descriptor);
        const check = { label: descriptor.label || `shader ${audit.shaders.length + 1}`, errors: [] as string[] };
        audit.shaders.push(check);
        audit.pending.push(module.getCompilationInfo().then(info => {
          check.errors = [...info.messages].filter(m => m.type === "error").map(m => `${m.lineNum}:${m.linePos} ${m.message}`);
        }).catch(error => { check.errors.push(String(error)); }));
        return module;
      };
    });
    await use();
    if (page.isClosed()) return;
    const report = await page.evaluate(async () => {
      const audit = window.__gpuAudit;
      if (!audit) return null;
      await Promise.all(audit.pending);
      return { shaders: audit.shaders, errors: audit.errors, shellError: window.__hui?.error ?? null,
        userAgent: navigator.userAgent, wgslFeatures: navigator.gpu ? [...navigator.gpu.wgslLanguageFeatures] : [] };
    });
    if (!report) return;
    await testInfo.attach("GPU compilation and validation", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    const errors = [...new Set([...report.errors, ...report.shaders.flatMap(s => s.errors.map(e => `${s.label}: ${e}`)), ...(report.shellError ? [report.shellError] : [])])];
    if (errors.length || testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach("Rendered failure", { body: await page.screenshot(), contentType: "image/png" });
    }
    expect(errors, "WGSL compilation or GPU validation failed; see the attached diagnostics and screenshot").toEqual([]);
  }, { auto: true }],
});

export { expect, type Page } from "@playwright/test";
