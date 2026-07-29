import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import RichTextEditor from "./RichTextEditor.vue";

// mount()'s inferred .vm type doesn't carry the defineExpose() surface through vue-tsc;
// cast to the shape we actually exposed so tests can drive it directly (see component's
// own comment on why: jsdom can't simulate real contenteditable typing).
function exposedApi(wrapper: VueWrapper): { isEmpty: boolean; setContent: (content: string) => void } {
  return wrapper.vm as unknown as { isEmpty: boolean; setContent: (content: string) => void };
}

// jsdom 沒有完整實作 contenteditable 需要的 Selection/Range API，沒辦法可靠地模擬
// 「選取文字後點格式按鈕」這種真的滑鼠/鍵盤操作；這裡測試在這個限制下還能可靠驗證的部分：
// 唯讀/可編輯切換、v-model 往返、舊資料（純文字）相容顯示、連結/圖片小表單的顯示切換。
//
// useEditor() 在 mounted 這個生命週期鉤子裡才真的建立 Tiptap 的 Editor 實例，
// 而 ProseMirror 把內容實際畫進 DOM 又晚了一個 macrotask，光 await nextTick() 不夠，
// 每次 mount 之後都要多等一輪 setTimeout(0)。
async function flushEditor(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("RichTextEditor - 需求/規格描述的所見即所得編輯器", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
  });

  it("shows the formatting toolbar when editable (the default)", async () => {
    wrapper = mount(RichTextEditor, { props: { modelValue: "" } });
    await flushEditor();
    expect(wrapper.find('[data-testid="richtext-toolbar"]').exists()).toBe(true);
  });

  it("hides the toolbar in read-only mode", async () => {
    wrapper = mount(RichTextEditor, { props: { modelValue: "", editable: false } });
    await flushEditor();
    expect(wrapper.find('[data-testid="richtext-toolbar"]').exists()).toBe(false);
  });

  it("starts empty for a blank modelValue", async () => {
    wrapper = mount(RichTextEditor, { props: { modelValue: "" } });
    await flushEditor();
    expect(exposedApi(wrapper).isEmpty).toBe(true);
  });

  it("is no longer empty, and emits update:modelValue, once content is set", async () => {
    wrapper = mount(RichTextEditor, { props: { modelValue: "" } });
    await flushEditor();
    exposedApi(wrapper).setContent("<p>寫點東西</p>");
    await flushEditor();

    expect(exposedApi(wrapper).isEmpty).toBe(false);
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    const lastValue = emitted![emitted!.length - 1][0] as string;
    expect(JSON.parse(lastValue)).toMatchObject({ type: "doc" });
    expect(lastValue).toContain("寫點東西");
  });

  it("renders legacy plain-text descriptions (pre-Tiptap data) instead of showing empty", async () => {
    wrapper = mount(RichTextEditor, { props: { modelValue: "舊版純文字描述", editable: false } });
    await flushEditor();
    expect(wrapper.find('[data-testid="richtext-content"]').text()).toContain("舊版純文字描述");
  });

  it("round-trips a Tiptap JSON document passed in as modelValue", async () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "已經存在的內容" }] }],
    });
    wrapper = mount(RichTextEditor, { props: { modelValue: doc, editable: false } });
    await flushEditor();
    expect(wrapper.find('[data-testid="richtext-content"]').text()).toContain("已經存在的內容");
  });

  it("toggles the link URL form open and closed", async () => {
    wrapper = mount(RichTextEditor, { props: { modelValue: "" } });
    await flushEditor();
    expect(wrapper.find('[data-testid="richtext-link-form"]').exists()).toBe(false);

    await wrapper.find('[data-testid="richtext-link"]').trigger("click");
    expect(wrapper.find('[data-testid="richtext-link-form"]').exists()).toBe(true);
  });

  it("toggles the image URL form open and closed", async () => {
    wrapper = mount(RichTextEditor, { props: { modelValue: "" } });
    await flushEditor();
    expect(wrapper.find('[data-testid="richtext-image-form"]').exists()).toBe(false);

    await wrapper.find('[data-testid="richtext-image"]').trigger("click");
    expect(wrapper.find('[data-testid="richtext-image-form"]').exists()).toBe(true);
  });

  it("inserts an image from the inline form and reflects it in the content", async () => {
    wrapper = mount(RichTextEditor, { props: { modelValue: "" } });
    await flushEditor();
    await wrapper.find('[data-testid="richtext-image"]').trigger("click");
    await wrapper.find('[data-testid="richtext-image-url"]').setValue("https://example.com/a.png");
    await wrapper.find('[data-testid="richtext-image-apply"]').trigger("click");

    expect(wrapper.find('[data-testid="richtext-content"] img').attributes("src")).toBe(
      "https://example.com/a.png",
    );
  });
});
