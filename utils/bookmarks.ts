import type { SyncBookmarkNode } from '../types';

let isApplyingRemoteBookmarks = false;

export function setApplyingRemote(status: boolean) {
  isApplyingRemoteBookmarks = status;
}

export function getIsApplyingRemote() {
  return isApplyingRemoteBookmarks;
}

/**
 * Generate a random UUID
 */
export function generateUUID(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Clean and serialize Chrome bookmark tree
 */
export function serializeBookmarkTree(nodes: chrome.bookmarks.BookmarkTreeNode[]): SyncBookmarkNode[] {
  return nodes.map((node) => {
    const item: SyncBookmarkNode = {
      id: node.id || generateUUID(),
      title: node.title || '',
      url: node.url,
      dateAdded: node.dateAdded,
      dateModified: (node as any).dateGroupModified,
    };

    if (node.children && node.children.length > 0) {
      item.children = serializeBookmarkTree(node.children);
    }

    return item;
  });
}

/**
 * Count total bookmarks (excluding root containers)
 */
export function countBookmarks(nodes: SyncBookmarkNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.url) {
      count++;
    }
    if (node.children) {
      count += countBookmarks(node.children);
    }
  }
  return count;
}

/**
 * Get entire local Chrome bookmark tree
 */
export async function getLocalBookmarkTree(): Promise<SyncBookmarkNode[]> {
  const tree = await chrome.bookmarks.getTree();
  // tree[0] is root, tree[0].children are typically:
  // [0]: Bookmarks Bar (书签栏)
  // [1]: Other Bookmarks (其他书签)
  // [2]: Mobile Bookmarks (移动设备书签)
  if (tree[0] && tree[0].children) {
    return serializeBookmarkTree(tree[0].children);
  }
  return serializeBookmarkTree(tree);
}

/**
 * Merge remote bookmark tree into local Chrome bookmarks.
 * Safe two-way merge: avoids deleting local bookmarks, adds missing ones.
 */
export async function applyRemoteBookmarkTree(remoteRoots: SyncBookmarkNode[]): Promise<number> {
  setApplyingRemote(true);
  let addedCount = 0;

  try {
    const localTree = await chrome.bookmarks.getTree();
    const localRoots = localTree[0]?.children || [];

    // Map over root folders: Bookmarks Bar, Other Bookmarks, etc.
    for (let i = 0; i < remoteRoots.length; i++) {
      const remoteRoot = remoteRoots[i];
      let targetLocalParent = localRoots[i];

      // If no matching local root folder by index, match by title or fallback to first
      if (!targetLocalParent && localRoots.length > 0) {
        targetLocalParent = localRoots.find((l) => l.title === remoteRoot.title) || localRoots[0];
      }

      if (targetLocalParent && remoteRoot.children) {
        addedCount += await syncChildren(targetLocalParent.id, remoteRoot.children);
      }
    }
  } finally {
    // Delay releasing the lock to let all Chrome event handlers process safely
    setTimeout(() => {
      setApplyingRemote(false);
    }, 1500);
  }

  return addedCount;
}

/**
 * Recursively sync children of a folder
 */
async function syncChildren(parentId: string, remoteChildren: SyncBookmarkNode[]): Promise<number> {
  let createdCount = 0;
  const localChildren = await chrome.bookmarks.getChildren(parentId);

  for (const remoteNode of remoteChildren) {
    if (remoteNode.url) {
      // It's a bookmark item
      // Check if URL already exists under this parent
      const exists = localChildren.find((l) => l.url === remoteNode.url);
      if (!exists) {
        await chrome.bookmarks.create({
          parentId,
          title: remoteNode.title,
          url: remoteNode.url,
        });
        createdCount++;
      } else if (exists.title !== remoteNode.title && remoteNode.title) {
        // Optionally update title if changed
        await chrome.bookmarks.update(exists.id, { title: remoteNode.title });
      }
    } else {
      // It's a folder
      let localFolder = localChildren.find((l) => !l.url && l.title === remoteNode.title);
      if (!localFolder) {
        localFolder = await chrome.bookmarks.create({
          parentId,
          title: remoteNode.title,
        });
        createdCount++;
      }

      if (remoteNode.children && remoteNode.children.length > 0) {
        createdCount += await syncChildren(localFolder.id, remoteNode.children);
      }
    }
  }

  return createdCount;
}

/**
 * Merge two bookmark trees into one combined tree (for pushing to WebDAV)
 */
export function mergeTrees(localTree: SyncBookmarkNode[], remoteTree: SyncBookmarkNode[]): SyncBookmarkNode[] {
  if (!remoteTree || remoteTree.length === 0) return localTree;
  if (!localTree || localTree.length === 0) return remoteTree;

  const result: SyncBookmarkNode[] = [];
  const maxRoots = Math.max(localTree.length, remoteTree.length);

  for (let i = 0; i < maxRoots; i++) {
    const local = localTree[i];
    const remote = remoteTree[i];

    if (local && remote) {
      result.push({
        id: local.id || remote.id,
        title: local.title || remote.title,
        children: mergeNodeChildren(local.children || [], remote.children || []),
      });
    } else if (local) {
      result.push(local);
    } else if (remote) {
      result.push(remote);
    }
  }

  return result;
}

function mergeNodeChildren(localNodes: SyncBookmarkNode[], remoteNodes: SyncBookmarkNode[]): SyncBookmarkNode[] {
  const merged: SyncBookmarkNode[] = [...localNodes];
  const urlMap = new Set(localNodes.filter((n) => n.url).map((n) => n.url));
  const folderMap = new Map(localNodes.filter((n) => !n.url).map((n) => [n.title, n]));

  for (const remote of remoteNodes) {
    if (remote.url) {
      if (!urlMap.has(remote.url)) {
        merged.push(remote);
        urlMap.add(remote.url);
      }
    } else {
      // Folder
      const existingLocalFolder = folderMap.get(remote.title);
      if (existingLocalFolder) {
        existingLocalFolder.children = mergeNodeChildren(
          existingLocalFolder.children || [],
          remote.children || []
        );
      } else {
        merged.push(remote);
        folderMap.set(remote.title, remote);
      }
    }
  }

  return merged;
}
