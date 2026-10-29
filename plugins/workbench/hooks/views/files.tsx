import type { RenderElement } from 'claude-code'

import type { Listing, OpenFile } from '../../types'
import { base, dir, isUnder, join, rel, same } from '../paths'
import { G, fit, fitStart, inView, plural } from './chrome'
import type { Actions, Kit, Model } from './model'
import { action, card, emptyState, icon, row, section, tile, tone, toolbar } from './ui'

/** The mark on what Claude wrote this session: its sparkle, and a word where there is room. */
export function claudeMark(kit: Kit, m: Model, label: string): RenderElement {
  const { Box, Text } = kit

  return (
    <Box flexDirection="row" alignItems="center" columnGap={0.5}>
      {icon(kit, m, 'sparkle', 'purple', 12)}
      {m.width >= 50 && <Text color={tone(m, 'purple')}>{label}</Text>}
    </Box>
  )
}

/** Lines of a file shown at a time while reading it. */
export const VIEW_LINES = 120
const MAX_ENTRIES = 300

const sizeOf = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`

/** Where Files is rooted: the repository in view, else the session's folder. */
export const filesRoot = (m: Model): string => inView(m)?.root ?? m.workspace

/** The folder's path from the root, each part a press back up to it. */
function crumbs(kit: Kit, m: Model, listing: Listing, act: Actions): RenderElement {
  const { Box, Text, Button } = kit
  const root = filesRoot(m)
  const parts = rel(listing.path, root).split('/').filter(part => part !== '')

  return (
    <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={0.5} marginTop={0.75}>
      {icon(kit, m, 'folder', 'blue', 14)}
      <Button key="crumb-root" plain dimColor={parts.length > 0} label={base(root)} onPress={() => act.openDir(root)} />
      {parts.map((part, at) => (
        <Box flexDirection="row" alignItems="center" columnGap={0.5}>
          <Text dimColor>{G.closed}</Text>
          <Button
            key={`crumb-${at}`}
            plain
            dimColor={at < parts.length - 1}
            label={part}
            onPress={() => act.openDir(join(root, ...parts.slice(0, at + 1)))}
          />
        </Box>
      ))}
    </Box>
  )
}

function searchView(kit: Kit, m: Model, act: Actions): RenderElement | false {
  const { Box, Text } = kit
  const found = m.search
  if (found === null) return false
  const root = filesRoot(m)

  return (
    <Box flexDirection="column">
      {section(
        kit,
        m,
        `Results for “${fit(found.query, 24)}”`,
        `${plural(found.names.length, 'file')} · ${plural(found.hits.length, 'line')}${found.isCut ? ' (first ones)' : ''}`,
        action(kit, m, 'search-clear', 'close', 'Clear', () => act.clearSearch(), 'gray'),
      )}
      {found.names.length === 0 && found.hits.length === 0 && card(kit, m, [<Text dimColor>Nothing matches.</Text>])}
      {found.names.length > 0 &&
        card(
          kit,
          m,
          found.names.slice(0, 40).map(path =>
            row(kit, m, {
              key: `name:${path}`,
              lead: icon(kit, m, 'doc', 'gray', 14),
              inline: true,
              title: base(path),
              sub: dir(path) === '' ? false : fitStart(dir(path), Math.max(12, m.width - 12)),
              onPress: () => act.openFile(join(root, path)),
            }),
          ),
          { dense: true },
        )}
      {found.hits.length > 0 &&
        card(
          kit,
          m,
          found.hits.slice(0, 80).map(hit =>
            row(kit, m, {
              key: `hit:${hit.path}:${hit.line}`,
              lead: <kit.Text dimColor>{`${fitStart(hit.path, 24)}:${hit.line}`}</kit.Text>,
              inline: true,
              title: fit(hit.text.trim() || ' ', Math.max(12, m.width - 34)),
              onPress: () => act.openFile(join(root, hit.path), hit.line),
            }),
          ),
          { dense: true },
        )}
    </Box>
  )
}

/** A folder's entries, folders first, and the search over the whole tree. */
export function browser(kit: Kit, m: Model, act: Actions): RenderElement {
  const { Box, Text, Input } = kit
  const listing = m.listing
  const root = filesRoot(m)
  if (root === '') return emptyState(kit, m, 'folder', 'blue', 'No folder', 'This session has no working folder.')

  return (
    <Box flexDirection="column">
      {Input !== undefined && (
        <Box flexDirection="row" alignItems="center" columnGap={1} marginTop={0.75}>
          {icon(kit, m, 'search', 'gray', 13)}
          <Box flexGrow={1}>
            <Input key="files-search" placeholder="a file's name, or words in files" submitLabel="search" onSubmit={text => act.searchFiles(text)} />
          </Box>
        </Box>
      )}
      {searchView(kit, m, act)}
      {m.search === null && listing === null && (
        <Box marginTop={1} {...(m.isGrid ? {} : { paddingX: 1 })}>
          <Text dimColor>Reading the folder…</Text>
        </Box>
      )}
      {m.search === null && listing !== null && (
        <Box flexDirection="column">
          {crumbs(kit, m, listing, act)}
          {card(
            kit,
            m,
            [
              listing.entries.length === 0 && <Text dimColor>An empty folder.</Text>,
              isUnder(listing.path, root) &&
                rel(listing.path, root) !== '' &&
                row(kit, m, { key: 'dir-up', lead: icon(kit, m, 'back', 'gray', 14), title: '..', inline: true, onPress: () => act.openDir(dir(listing.path)) }),
              ...listing.entries.slice(0, MAX_ENTRIES).map(entry => {
                const at = join(listing.path, entry.name)
                const byClaude = entry.isDir ? m.touched.filter(one => isUnder(one.path, at)).length : m.touched.some(one => same(one.path, at)) ? 1 : 0

                return entry.isDir
                  ? row(kit, m, {
                      key: `dir:${entry.name}`,
                      lead: icon(kit, m, 'folder', 'blue', 14),
                      inline: true,
                      title: entry.name,
                      trail: [byClaude > 0 && claudeMark(kit, m, `${byClaude} by Claude`)],
                      onPress: () => act.openDir(at),
                      chevron: 'right',
                    })
                  : row(kit, m, {
                      key: `file:${entry.name}`,
                      lead: icon(kit, m, 'doc', 'gray', 14),
                      inline: true,
                      title: fit(entry.name, Math.max(10, m.width - 18)),
                      trail: [byClaude > 0 && claudeMark(kit, m, 'Claude'), <Text dimColor>{sizeOf(entry.size)}</Text>],
                      onPress: () => act.openFile(at),
                    })
              }),
              listing.entries.length > MAX_ENTRIES && <Text dimColor>{`+${listing.entries.length - MAX_ENTRIES} more`}</Text>,
            ],
            { dense: true },
          )}
        </Box>
      )}
    </Box>
  )
}

/** One file: read a window of it at a time, or edit it where the surface runs the editor. */
export function fileView(kit: Kit, m: Model, file: OpenFile, act: Actions): RenderElement {
  const { Box, Text, Code } = kit
  const lines = file.text.split('\n')
  const canEdit = kit.editor !== undefined && file.note === ''
  const top = Math.max(0, Math.min(file.top, Math.max(0, lines.length - 1)))
  const end = Math.min(lines.length, top + VIEW_LINES)
  const where = rel(dir(file.path), filesRoot(m))

  return (
    <Box flexDirection="column">
      {card(kit, m, [
        row(kit, m, {
          key: 'file-head',
          lead: tile(kit, m, file.isEditing ? 'pencil' : 'doc', file.isEditing ? 'orange' : 'blue', 26),
          title: base(file.path),
          isBold: true,
          sub: `${where === '' ? '' : `${where} · `}${file.isEditing ? 'Editing' : file.note === '' ? `Lines ${top + 1}–${end} of ${lines.length}` : 'Not shown'}`,
        }),
        toolbar(kit, [
          file.isEditing
            ? action(kit, m, 'file-back', 'check', 'Done', () => act.toggleEdit(), 'blue', true)
            : action(kit, m, 'file-back', 'back', 'Back', () => act.closeFile(), 'blue'),
          canEdit && !file.isEditing && action(kit, m, 'file-edit', 'pencil', 'Edit', () => act.toggleEdit(), 'orange'),
          action(kit, m, 'file-at', 'at', 'Mention', () => act.mention(file.path), 'gray'),
          !file.isEditing && file.note === '' && top > 0 && action(kit, m, 'file-prev', 'up', 'Previous', () => act.pageFile(-1), 'gray'),
          !file.isEditing && file.note === '' && end < lines.length && action(kit, m, 'file-next', 'down', 'Next', () => act.pageFile(1), 'gray'),
        ]),
      ])}
      <Box flexDirection="column" marginTop={0.5}>
        {file.note !== '' && card(kit, m, [<Text color={tone(m, 'orange')}>{file.note}</Text>])}
        {file.note === '' && file.isEditing && kit.editor !== undefined &&
          card(kit, m, [
            kit.editor({
              path: file.path,
              text: file.text,
              rev: file.mtimeMs,
              rows: m.rows > 0 ? m.rows - 6 : 30,
              isProportional: !m.isGrid,
              accent: tone(m, 'blue'),
            }),
          ])}
        {file.note === '' && !file.isEditing && <Code source={lines.slice(top, end).join('\n') || ' '} startLine={top + 1} path={file.path} />}
      </Box>
    </Box>
  )
}
