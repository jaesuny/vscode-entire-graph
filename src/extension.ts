import * as vscode from "vscode";
import { EntirePanel } from "./entirePanel";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("entire-graph.show", () => {
      EntirePanel.createOrShow(context);
    })
  );
}

export function deactivate() {}
