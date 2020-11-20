import * as vscode from 'vscode';
import { Favorite, FavoriteKind } from './favorite';
import { FavoriteStore } from './favoriteStore';
import { FavoritesTreeDataProvider } from './favoriteTreeDataProvider';

/**
 * Registry of all enabled commands.
 */
export enum Commands {
    PaletteFavoriteActiveFile = 'fav.palette.favoriteActiveFile',
    PaletteFavoriteActiveFileToGroup = 'fav.palette.favoriteActiveFileToGroup',
    PaletteFavoriteOpen = 'fav.palette.openFavorite',
    PaletteGroupCreate = 'fav.palette.createGroup',
    PaletteGroupOpen = 'fav.palette.openGroup',
    ViewGroupCreate = 'fav.view.createGroup',
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

    private _treeView: vscode.TreeView<Favorite>;
    private _store: FavoriteStore;

    constructor(context: vscode.ExtensionContext) {
        this._store = FavoriteStore.load(context);
        this._treeView = vscode.window.createTreeView('favorites', {
            treeDataProvider: new FavoritesTreeDataProvider(this._store),
            canSelectMany: false
        });

        this.registerCommands(context);
    }

    /**
     * Adds the selected GUI element to the Favorites list (top level).
     * @param node An element selected in the GUI.
     */
    favoriteActiveFile(node: any): void {
        let path = this.selectedElementPath(node);
        if (!path) {
            return;
        }

        vscode.window.showInputBox({ prompt: 'Label', value: path }).then((v) => {
            if (!v) { return; }

            let fav = new Favorite();
            fav.label = v;
            fav.resourcePath = path || '';
            fav.kind = FavoriteKind.File;

            this._store.add(fav);
            this._treeView.reveal(fav);
        });
    }

    /**
     * Adds the selected GUI element to the Favorites list in a group.
     * Prompts the user via QuickPick for the group to add the Favorite to.
     * @param node An element selected in the GUI.
     */
    favoriteActiveFileToGroup(node: any): void {
        let path = this.selectedElementPath(node);
        if (!path) {
            return;
        }

        let groups = this._store.groups();
        if (!groups) {
            vscode.window.showWarningMessage('No favorite groups found, please define a group first');
            return;
        }

        vscode.window.showQuickPick(groups).then(selection => {
            if (selection) {
                vscode.window.showInputBox({ prompt: 'Label', value: path }).then((v) => {
                    if (!v) { return; }

                    let fav = new Favorite();
                    fav.label = v;
                    fav.resourcePath = path || '';
                    fav.kind = FavoriteKind.File;
                    selection.children.push(fav);
                    this._store.update(selection);

                    fav.parent = selection.uuid;
                    this._treeView.reveal(fav);
                });
            }
        });
    }

    /**
     * Shows the user a QuickPick in which he can choose the favorite to open.
     */
    openFavorite(): void {
        vscode.window.showQuickPick(this._store.favorites().flatMap(x => {
            if (FavoriteKind.Group === x.kind) {
                return x.children;
            } else {
                return [x];
            }
        })).then(selection => {
            if (selection) {
                vscode.window.showTextDocument(selection.resourceUri, { preview: false });
            }
        });
    }

    /**
     * Opens all the Favorites registered in the group selected by the user.
     * Group selection is performed via QuickPick.
     * @param fav A favorite group, if no group is provied the user will be prompted to pick a group.
     */
    openGroup(fav: Favorite): void {
        let promise = (fav && FavoriteKind.Group === fav.kind && fav.children) ? Promise.resolve(fav) : vscode.window.showQuickPick(this._store.favorites().filter(f => FavoriteKind.Group === f.kind));

        promise.then(selection => {
            if (selection) {
                selection.children.forEach(fav => vscode.window.showTextDocument(fav.resourceUri, { preview: false }));
            }
        });
    }

    /**
     * Adds a new group to the favorites bar.
     */
    createGroup(): void {
        vscode.window.showInputBox({ prompt: 'New favorite group name :', value: 'New group' }).then((v) => {
            if (!v) { return; }

            let fav = new Favorite();
            fav.label = v;
            fav.kind = FavoriteKind.Group;

            this._store.add(fav);
            this._treeView.reveal(fav);
        });
    }


    /**
     * Deletes a Favorite from the stored Favorites.
     * @param favorite The Favorite to delete
     */
    removeFavorite(favorite: Favorite): void {
        if (favorite) {
            var message = FavoriteKind.Group === favorite.kind ? `Removing the '${favorite.label}' group will also remove all its favorites, proceed ?` : `Remove '${favorite.label}' from your favorites ?`;
            vscode.window.showWarningMessage(message, 'Yes', 'No').then(choice => {
                if ('Yes' === choice) {
                    this._store.delete(favorite);
                }
            });
        }
    }

    /**
     * Renames a Favorite'
     * @param favorite The Favorite to rename
     */
    renameFavorite(favorite: Favorite): void {
        if (favorite) {
            vscode.window.showInputBox({ prompt: 'Rename to', value: favorite.label }).then(value => {
                if (value) {
                    favorite.label = value;
                    this._store.update(favorite);
                }
            });
        }
    }

    /**
     * Register the extension's commands.
     * @param context The extension's context
     */
    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteFavoriteActiveFile, this.favoriteActiveFile, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.MenuFavoriteActiveFile, this.favoriteActiveFile, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteFavoriteActiveFileToGroup, this.favoriteActiveFileToGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.MenuFavoriteActiveFileToGroup, this.favoriteActiveFileToGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteFavoriteOpen, this.openFavorite, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteGroupCreate, this.createGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.PaletteGroupOpen, this.openGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ViewGroupCreate, this.createGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextFavoriteRemove, this.removeFavorite, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextFavoriteRename, this.renameFavorite, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextGroupOpen, this.openGroup, this));
        context.subscriptions.push(vscode.commands.registerCommand(Commands.ContextResourceOpen, resource => this.openResource(resource)));
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
     * Utility function to open a URI in a text editor.
     * @param resource A resource URI
     */
    openResource(resource: vscode.Uri): void {
        vscode.window.showTextDocument(resource, { preview: false });
    }
}