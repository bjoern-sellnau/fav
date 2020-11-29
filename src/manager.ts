import * as vscode from 'vscode';
import { Bookmarkable, bookmarkableLabelComparator, Favorite, Group, isGroup } from './model';
import { FavoriteStore } from './store';
import { FavoritesTreeDataProvider } from './tree';
import { Utils } from './utils';

/**
 * Registry of all enabled commands.
 */
export enum Commands {
    PaletteFavoriteActiveFile = 'fav.palette.favoriteActiveFile',
    PaletteFavoriteActiveFileToGroup = 'fav.palette.favoriteActiveFileToGroup',
    PaletteEdit = 'fav.palette.edit',
    PaletteReload = 'fav.palette.reload',
    PaletteFavoriteOpen = 'fav.palette.openFavorite',
    PaletteGroupCreate = 'fav.palette.createGroup',
    PaletteGroupOpen = 'fav.palette.openGroup',
    ViewGroupCreate = 'fav.view.createGroup',
    ContextFavoriteMove = 'fav.context.moveFavorite',
    ContextFavoriteRemove = 'fav.context.removeFavorite',
    ContextFavoriteRename = 'fav.context.renameFavorite',
    ContextResourceOpen = 'fav.context.openResource',
    ContextGroupOpen = 'fav.context.openGroup',
    MenuFavoriteActiveFile = 'fav.menu.favoriteActiveFile',
    MenuFavoriteActiveFileToGroup = 'fav.menu.favoriteActiveFileToGroup',
}

/**
 * Core Extension component.
 */
export class FavoriteManager {

    private _treeView: vscode.TreeView<Bookmarkable>; // Favorites tree view mainly used for revealing favorites upon updates
    private _store: FavoriteStore; // Underlying storage
    private _provider: FavoritesTreeDataProvider; // Treeview Data provider

    constructor(context: vscode.ExtensionContext) {
        this._store = FavoriteStore.fromContext(context, () => this._provider.refresh());

        this._provider = new FavoritesTreeDataProvider(this._store);

        this._treeView = vscode.window.createTreeView('favorites', {
            treeDataProvider: this._provider,
            canSelectMany: false
        });

        this.registerCommands(context);


        vscode.workspace.onDidSaveTextDocument(document => {
            // If the user saves the favorites.json file, we reserve some special treatment
            if (document.uri.fsPath === this._store.storeUri.fsPath) {
                this.reloadFavorites();
            }
        });
    }

    /**
     * Adds the selected GUI element to the Favorites list (top level).
     * @param node An element selected in the GUI.
     */
    async favoriteActiveFile(node: any): Promise<void> {
        let path = this.selectedElementPath(node);
        if (!path) {
            return;
        }

        let label = await vscode.window.showInputBox({ prompt: 'Label', value: Utils.fileName(path as string) });
        if (!label) { return; }

        let fav = new Favorite();
        fav.label = label;
        fav.resourcePath = path || '';

        this._store.add(fav);
        this._provider.refresh();
        this._treeView.reveal(fav, { select: true, focus: true });
    }

    /**
     * Adds the selected GUI element to the Favorites list in a group.
     * Prompts the user via QuickPick for the group to add the Favorite to.
     * @param node An element selected in the GUI.
     */
    async favoriteActiveFileToGroup(node: any): Promise<void> {
        let path = this.selectedElementPath(node);
        if (!path) {
            return;
        }

        let groups = this._store.groups();
        if (!groups || groups.length === 0) {
            vscode.window.showWarningMessage('No favorite groups found, please define a group first');
            return;
        }

        let group = await vscode.window.showQuickPick(groups);
        if (group) {
            let label = await vscode.window.showInputBox({ prompt: 'Label', value: Utils.fileName(path as string) });
            if (!label) { return; }

            let fav = new Favorite();
            fav.label = label;
            fav.resourcePath = path || '';

            group?.addChild(fav);
            this._store.update(group);
            this._provider.refresh(group);
            this._treeView.reveal(fav);
        }
    }

    /**
     * Opens the favorites.json file for edition
     */
    editFavorites(): void {
        vscode.window.showTextDocument(this._store.storeUri, { preview: false, preserveFocus: false });
        vscode.window.showWarningMessage('Please be careful when manually editing your favorites', 'Understood');
    }

    /**
     * Forces the store to reload the favorites from the favorites.json file
     */
    async reloadFavorites(): Promise<void> {
        try {
            await this._store.refresh();
        } catch (err) {
            vscode.window.showErrorMessage(err.message, 'Ok');
        }
    }

    /**
     * Shows the user a QuickPick in which he can choose the favorite to open.
     */
    async openFavorite(): Promise<void> {
        let favorites = this._store.all().flatMap(x => {
            if (isGroup(x)) {
                return (x as Group).children.map(child => {
                    (child as Favorite).description = `  $(folder) ${x.label}`;
                    return child;
                });
            } else {
                return [x];
            }
        }).sort(bookmarkableLabelComparator);

        let favorite = await vscode.window.showQuickPick(favorites);
        if (favorite) {
            vscode.window.showTextDocument((favorite as Favorite).resourceUri, { preview: false });
        }
    }

    /**
     * Opens all the Favorites registered in the group selected by the user.
     * Group selection is performed via QuickPick.
     * @param group A favorite group, if no group is provided the user will be prompted to pick a group.
     */
    async openGroup(group: Group | undefined): Promise<void> {
        if (!group || !group.hasChildren) {
            group = await this.promptGroupSelection();
        }

        if (group) {
            group.children.forEach(f => vscode.window.showTextDocument((f as Favorite).resourceUri, { preview: false }));
        }
    }

    /**
     * Adds a new group to the favorites bar.
     */
    async createGroup(): Promise<void> {
        let label = await vscode.window.showInputBox({ prompt: 'New favorite group name :', value: 'New group' });
        if (!label) { return; }

        let group = new Group();
        group.label = label;

        this._store.add(group);
        this._provider.refresh(undefined);
        this._treeView.reveal(group);
    }

    /**
     * Deletes a Favorite from the stored Favorites.
     * @param favorite The Favorite to delete
     */
    async removeFavorite(favorite: Bookmarkable): Promise<void> {
        if (favorite) {
            var message = `Remove '${favorite.label}' from your favorites ?`;
            if (isGroup(favorite)) {
                let group = favorite as Group;
                if (group.hasChildren) {
                    message = `Remove the '${group.label}' group and all its favorites - ${group.children.length} favorite(s) ?`;
                }
            }


            let choice = await vscode.window.showWarningMessage(message, 'Yes', 'No');
            if ('Yes' === choice) {
                this._store.delete(favorite);
                this._provider.refresh(undefined);
            }
        }
    }

    /**
     * Prompts the user for a group to move the favorite to.
     * @param favorite The favorite to move to another group
     */
    async moveFavorite(favorite: Favorite): Promise<void> {
        if (!favorite) {
            return;
        }
        let parent = this._store.getParent(favorite);

        let group = await this.promptGroupSelection(parent);
        if (group) {
            if (parent) {
                (parent as Group).removeChild(favorite);
            } else {
                // Top level Favorite
                this._store.delete(favorite);
            }

            group.addChild(favorite);
            this._store.update();
            this._provider.refresh();
            this._treeView.reveal(favorite);
        }
    }

    /**
     * Renames a Favorite'
     * @param bk The Favorite to rename
     */
    async renameFavorite(bk: Bookmarkable): Promise<void> {
        if (bk) {
            let label = await vscode.window.showInputBox({ prompt: 'Rename to', value: bk.label });
            if (label) {
                bk.label = label;
                this._store.update(bk);
                this._provider.refresh(bk);
                this._treeView.reveal(bk);
            }
        }
    }

    /**
     * Utility function to open a URI in a text editor.
     * @param resource A resource URI
     */
    openResource(resource: vscode.Uri): void {
        vscode.window.showTextDocument(resource, { preview: false });
    }

    /**
     * Register the extension's commands.
     * @param context The extension's context
     */
    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteFavoriteActiveFile, this.favoriteActiveFile, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.MenuFavoriteActiveFile, this.favoriteActiveFile, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteEdit, this.editFavorites, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteReload, this.reloadFavorites, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteFavoriteActiveFileToGroup, this.favoriteActiveFileToGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.MenuFavoriteActiveFileToGroup, this.favoriteActiveFileToGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteFavoriteOpen, this.openFavorite, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteGroupCreate, this.createGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteGroupOpen, this.openGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ViewGroupCreate, this.createGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextFavoriteRemove, this.removeFavorite, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextFavoriteRename, this.renameFavorite, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextFavoriteMove, this.moveFavorite, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextGroupOpen, this.openGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextResourceOpen, this.openResource, this));
    }

    /**
     * Utility function to return the selected element's path.
     * @param node some kind of object
     */
    private selectedElementPath(node: any): string | undefined {
        if (node && node.fsPath) {
            return node.fsPath;
        } else if (vscode.window.activeTextEditor) {
            return vscode.window.activeTextEditor.document.uri.fsPath;
        } else {
            return undefined;
        }
    }

    /**
     * Opens a quickpick and prompts the user to select a Favorite group.
     */
    private promptGroupSelection(...exclusions: (Group | undefined)[]): Thenable<Group | undefined> {
        return vscode.window.showQuickPick(this._store.groups().filter(f => !exclusions.find(x => x?.uuid === f.uuid)));
    }
}