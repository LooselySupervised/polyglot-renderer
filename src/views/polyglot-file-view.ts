import { FileView, TFile, WorkspaceLeaf } from "obsidian";
import type { FormatRenderer } from "registry/format-renderer";
import { inlineAssets } from "asset-inliner";

export class PolyglotFileView extends FileView {
	private renderer: FormatRenderer;
	private viewType: string;
	private hasRegisteredVaultEvents = false;

	constructor(leaf: WorkspaceLeaf, renderer: FormatRenderer, viewType: string) {
		super(leaf);
		this.renderer = renderer;
		this.viewType = viewType;
	}

	getViewType(): string {
		return this.viewType;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Preview";
	}

	getIcon(): string {
		return this.renderer.icon;
	}

	canAcceptExtension(extension: string): boolean {
		return this.renderer.extensions.includes(extension);
	}

	protected onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("polyglot-file-view");

		if (!this.hasRegisteredVaultEvents) {
			this.registerEvent(
				this.app.vault.on("modify", async (modifiedFile) => {
					if (modifiedFile instanceof TFile && modifiedFile === this.file) {
						let content = await this.app.vault.cachedRead(modifiedFile);
						content = await inlineAssets(content, this.app, modifiedFile.path);
						this.renderer.renderFile(content, this.contentEl);
					}
				})
			);
			this.hasRegisteredVaultEvents = true;
		}
		return Promise.resolve();
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		let content = await this.app.vault.cachedRead(file);
		content = await inlineAssets(content, this.app, file.path);
		this.renderer.renderFile(content, this.contentEl);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.contentEl.empty();
		await super.onUnloadFile(file);
	}

	protected onClose(): Promise<void> {
		this.contentEl.empty();
		return Promise.resolve();
	}
}
