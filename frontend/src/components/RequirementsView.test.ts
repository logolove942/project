import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { waitFor } from "../testSupport";
import RequirementsView from "./RequirementsView.vue";

describe("RequirementsView - 需求/規格管理", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let wrapper: VueWrapper | undefined;

  beforeEach(async () => {
    service = createTaskService();
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  it("lists existing requirements with their nested specs", async () => {
    const requirement = service.createRequirement("需求A");
    service.createSpec(requirement.id, "規格A-1");

    wrapper = mount(RequirementsView, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    expect(wrapper.find(`[data-testid="requirement-${requirement.id}"]`).text()).toContain("需求A");
    expect(wrapper.find(`[data-testid="requirement-${requirement.id}"]`).text()).toContain("規格A-1");
  });

  it("creates a new requirement and shows it in the list immediately", async () => {
    wrapper = mount(RequirementsView, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find('[data-testid="new-requirement-title"]').setValue("新的需求");
    await wrapper.find('[data-testid="new-requirement-form"]').trigger("submit");

    await waitFor(() => wrapper!.text().includes("新的需求"));
    expect(service.listRequirements().some((r) => r.title === "新的需求")).toBe(true);
  });

  it("shows an inline error when submitting without a title", async () => {
    wrapper = mount(RequirementsView, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find('[data-testid="new-requirement-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="new-requirement-error"]').exists());
    expect(service.listRequirements()).toHaveLength(0);
  });
});
