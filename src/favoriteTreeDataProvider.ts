import { Event, EventEmitter, ProviderResult, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { Favorite } from "./favorite";
import { FavoriteStore } from "./favoriteStore";

export class FavoritesTreeDataProvider  implements TreeDataProvider<Favorite>{
    private _onDidChangeTreeData: EventEmitter<Favorite | undefined | null | void> = new EventEmitter<Favorite | undefined | null | void>();
    readonly onDidChangeTreeData: Event<Favorite | undefined | null | void> = this._onDidChangeTreeData.event;

    private _store:FavoriteStore;
    constructor(store:FavoriteStore){
        this._store = store;
        this._store.onFavoriteAdded((f) => this.refresh(undefined));
        this._store.onFavoriteDeleted((f) => this.refresh(undefined));
        this._store.onFavoriteUpdated((f) => this.refresh(f));
    }
  
    refresh(f:Favorite | undefined | null | void): void {
      this._onDidChangeTreeData.fire(f);
    }
    
    getTreeItem(element: Favorite): TreeItem | Thenable<TreeItem> {
        return element.toTreeItem();
    }

    getParent(element:Favorite): ProviderResult<Favorite>{
        return undefined;
    }

    getChildren(element?: Favorite): ProviderResult<Favorite[]> {
        if(!element){
            return this._store.favorites();
        }
        return undefined;
    }
}