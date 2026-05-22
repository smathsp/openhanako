import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { executeDirectAutomationAction } from "../lib/desk/automation-executors.js";

describe("direct automation executors", () => {
  it("delivers notify actions through the notification gateway", async () => {
    const deliverNotification = vi.fn(async () => ({
      ok: true,
      deliveries: [{ channel: "desktop", status: "sent" }],
    }));

    const result = await executeDirectAutomationAction({
      id: "job_notify",
      actorAgentId: "hana",
      executor: {
        kind: "direct_action",
        action: "notify",
        params: {
          title: "喝水",
          body: "站起来活动一下",
          channels: ["desktop"],
        },
      },
    }, { deliverNotification });

    expect(deliverNotification).toHaveBeenCalledWith(
      {
        title: "喝水",
        body: "站起来活动一下",
        channels: ["desktop"],
      },
      { agentId: "hana" },
    );
    expect(result).toMatchObject({
      executorKind: "direct_action",
      action: "notify",
      delivery: {
        ok: true,
        deliveries: [{ channel: "desktop", status: "sent" }],
      },
    });
  });

  it("creates files inside the captured execution cwd", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-automation-file-"));
    try {
      const result = await executeDirectAutomationAction({
        id: "job_file",
        actorAgentId: "hana",
        executionContext: {
          kind: "session_workspace",
          cwd: root,
          workspaceFolders: [],
          sourceSessionPath: "/sessions/source.jsonl",
          createdByAgentId: "hana",
        },
        executor: {
          kind: "direct_action",
          action: "file.create",
          params: {
            relativePath: "notes/today.md",
            content: "# Today\n",
            ifExists: "fail",
          },
        },
      }, {});

      const filePath = path.join(root, "notes", "today.md");
      expect(fs.readFileSync(filePath, "utf-8")).toBe("# Today\n");
      expect(result).toMatchObject({
        executorKind: "direct_action",
        action: "file.create",
        file: {
          filePath,
          relativePath: "notes/today.md",
          created: true,
        },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects file creation outside the captured cwd", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-automation-file-"));
    try {
      await expect(executeDirectAutomationAction({
        id: "job_file",
        executionContext: { kind: "session_workspace", cwd: root, workspaceFolders: [] },
        executor: {
          kind: "direct_action",
          action: "file.create",
          params: { relativePath: "../escape.md", content: "no" },
        },
      }, {})).rejects.toThrow(/relativePath must stay inside execution cwd/);

      await expect(executeDirectAutomationAction({
        id: "job_file",
        executionContext: { kind: "session_workspace", cwd: root, workspaceFolders: [] },
        executor: {
          kind: "direct_action",
          action: "file.create",
          params: { relativePath: path.join(root, "absolute.md"), content: "no" },
        },
      }, {})).rejects.toThrow(/relativePath must be relative/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing files by default", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hana-automation-file-"));
    try {
      fs.writeFileSync(path.join(root, "daily.md"), "old", "utf-8");

      await expect(executeDirectAutomationAction({
        id: "job_file",
        executionContext: { kind: "session_workspace", cwd: root, workspaceFolders: [] },
        executor: {
          kind: "direct_action",
          action: "file.create",
          params: { relativePath: "daily.md", content: "new" },
        },
      }, {})).rejects.toThrow(/target already exists/);

      expect(fs.readFileSync(path.join(root, "daily.md"), "utf-8")).toBe("old");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
