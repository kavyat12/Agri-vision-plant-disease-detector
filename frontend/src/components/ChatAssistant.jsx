import { useEffect, useMemo, useState } from 'react'
import { sendChatMessage } from '../utils/api'

const STORAGE_KEY = 'agrivision:conversations:v1'
const DATE_LOCALES = { en: 'en', hi: 'hi-IN', kn: 'kn-IN', mr: 'mr-IN' }

function readConversations() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(stored)
      ? stored.filter((item) => (
        typeof item?.id === 'string'
        && typeof item.title === 'string'
        && Array.isArray(item.messages)
        && item.messages.every((message) => (
          ['user', 'assistant'].includes(message?.role)
          && typeof message.content === 'string'
        ))
      ))
      : []
  } catch {
    return []
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function renderInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="rounded bg-black/5 px-1 dark:bg-white/10">{part.slice(1, -1)}</code>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

function renderMarkdown(content) {
  const lines = content.split(/\r?\n/)
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }
    if (/^```/.test(line)) {
      const code = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++])
      index += 1
      blocks.push(<pre key={`code-${index}`} className="overflow-x-auto rounded-xl bg-black/5 p-3 dark:bg-white/10"><code>{code.join('\n')}</code></pre>)
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h2' : 'h3'
      blocks.push(<Tag key={`heading-${index}`} className="font-bold">{renderInline(heading[2], `heading-${index}`)}</Tag>)
      index += 1
      continue
    }
    const listMatch = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)
    if (listMatch) {
      const ordered = /^\s*\d+\./.test(line)
      const Tag = ordered ? 'ol' : 'ul'
      const items = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)
        if (!item || /^\s*\d+\./.test(lines[index]) !== ordered) break
        items.push(<li key={`item-${index}`}>{renderInline(item[1], `item-${index}`)}</li>)
        index += 1
      }
      blocks.push(<Tag key={`list-${index}`} className={ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}>{items}</Tag>)
      continue
    }
    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s|^\s*(?:[-*]|\d+\.)\s|^```/.test(lines[index])) {
      paragraph.push(lines[index++])
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((part, partIndex) => (
      <span key={`${index}-${partIndex}`}>{partIndex > 0 && <br />}{renderInline(part, `paragraph-${index}-${partIndex}`)}</span>
    ))}</p>)
  }
  return <div className="space-y-2 break-words">{blocks}</div>
}

export default function ChatAssistant({ locale, providers, backendOnline, t }) {
  const [state, setState] = useState(() => {
    const conversations = readConversations()
    return { conversations, activeId: conversations[0]?.id || null }
  })
  const [search, setSearch] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState(false)

  const active = state.conversations.find((item) => item.id === state.activeId)
  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return state.conversations
    return state.conversations.filter((item) => (
      item.title.toLowerCase().includes(query)
      || item.messages.some((message) => message.content.toLowerCase().includes(query))
    ))
  }, [search, state.conversations])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [state.conversations])

  function updateConversation(id, update) {
    setState((previous) => ({
      ...previous,
      conversations: previous.conversations.map((item) => (
        item.id === id ? update(item) : item
      )),
    }))
  }

  function newConversation() {
    const conversation = {
      id: createId(),
      title: t('newChat'),
      createdAt: new Date().toISOString(),
      messages: [],
    }
    setState((previous) => ({
      conversations: [conversation, ...previous.conversations],
      activeId: conversation.id,
    }))
    setInput('')
    setError('')
  }

  async function sendMessage(rawText, retry = false) {
    const content = rawText.trim()
    if (!content || sending) return

    const now = new Date().toISOString()
    const current = active || {
      id: createId(),
      title: content.slice(0, 52),
      createdAt: now,
      messages: [],
    }
    const userMessage = retry ? current.messages[current.messages.length - 1] : {
      role: 'user',
      content,
      createdAt: now,
    }
    const displayMessages = retry ? current.messages : [...current.messages, userMessage]
    const requestMessages = retry
      ? [...current.messages.slice(0, -1), userMessage]
      : displayMessages
    const title = current.messages.length ? current.title : content.slice(0, 52)

    setState((previous) => {
      const updated = { ...current, title, messages: displayMessages, updatedAt: now }
      const exists = previous.conversations.some((item) => item.id === current.id)
      return {
        activeId: current.id,
        conversations: exists
          ? previous.conversations.map((item) => item.id === current.id ? updated : item)
          : [updated, ...previous.conversations],
      }
    })
    setInput('')
    setError('')
    setSending(true)

    try {
      const result = await sendChatMessage({
        language: locale === 'mr' ? 'mr' : locale,
        messages: requestMessages.slice(-20).map(({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        })),
      })
      const responseMessage = {
        role: 'assistant',
        content: result.answer,
        createdAt: new Date().toISOString(),
      }
      updateConversation(current.id, (item) => ({
        ...item,
        messages: [...item.messages, responseMessage],
        updatedAt: responseMessage.createdAt,
      }))
    } catch (requestError) {
      setError(requestError.message || t('providerError'))
    } finally {
      setSending(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    void sendMessage(input)
  }

  function renameConversation(conversation) {
    const title = window.prompt(t('rename'), conversation.title)
    if (title?.trim()) {
      updateConversation(conversation.id, (item) => ({ ...item, title: title.trim() }))
    }
  }

  function deleteConversation(conversation) {
    if (!window.confirm(`${t('delete')} "${conversation.title}"?`)) return
    setState((previous) => {
      const conversations = previous.conversations.filter((item) => item.id !== conversation.id)
      return {
        conversations,
        activeId: previous.activeId === conversation.id ? conversations[0]?.id || null : previous.activeId,
      }
    })
  }

  async function copyResponse(content) {
    try {
      await navigator.clipboard.writeText(content)
      setError(t('copied'))
    } catch {
      setError(t('copyFailed'))
    }
  }

  const lastUserMessage = active?.messages.filter((message) => message.role === 'user').at(-1)
  const lastMessage = active?.messages.at(-1)
  const hasProvider = providers.length > 0
  const dateLocale = DATE_LOCALES[locale] || 'en'

  return (
    <section className="animate-fade-in" aria-labelledby="chat-title">
      <div className="mb-5">
        <span className="eyebrow">{t('assistant')}</span>
        <h1 id="chat-title" className="font-display text-3xl font-bold mt-2">{t('chatTitle')}</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>{t('chatIntro')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="card p-4" aria-label={t('conversations')}>
          <button type="button" className="btn-primary w-full" onClick={newConversation}>
            + {t('newChat')}
          </button>
          <label className="sr-only" htmlFor="conversation-search">{t('searchChats')}</label>
          <input
            id="conversation-search"
            className="input mt-3"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchChats')}
          />
          <h2 className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            {t('conversations')}
          </h2>
          <div className="max-h-[42vh] space-y-2 overflow-y-auto md:max-h-[60vh]">
            {visibleConversations.map((conversation) => (
              <div
                key={conversation.id}
                className="rounded-xl border p-2"
                style={{
                  borderColor: 'var(--line)',
                  background: state.activeId === conversation.id ? 'var(--brand-50)' : 'var(--surface)',
                }}
              >
                <button
                  type="button"
                  className="w-full truncate px-1 py-1 text-left text-sm font-semibold"
                  aria-current={state.activeId === conversation.id ? 'page' : undefined}
                  onClick={() => { setState((previous) => ({ ...previous, activeId: conversation.id })); setError('') }}
                >
                  {conversation.title}
                </button>
                <div className="mt-1 flex gap-3 px-1 text-xs">
                  <button type="button" className="underline" onClick={() => renameConversation(conversation)}>{t('rename')}</button>
                  <button type="button" className="underline" onClick={() => deleteConversation(conversation)}>{t('delete')}</button>
                </div>
              </div>
            ))}
            {visibleConversations.length === 0 && (
              <p className="py-2 text-sm" style={{ color: 'var(--muted)' }}>{t('emptyChatDescription')}</p>
            )}
          </div>
        </aside>

        <div className="card flex min-h-[65vh] flex-col overflow-hidden">
          {!hasProvider && (
            <div className="border-b p-4" style={{ borderColor: 'var(--line)' }} role="status">
              <h2 className="font-semibold">{t('noProviderTitle')}</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                {backendOnline ? t('noProviderMessage') : t('backendUnavailable')}
              </p>
            </div>
          )}
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-live="polite">
            {!active?.messages.length ? (
              <div className="mx-auto flex min-h-[42vh] max-w-xl flex-col items-center justify-center text-center">
                <span aria-hidden="true" className="mb-4 text-4xl">🌱</span>
                <h2 className="font-display text-2xl font-bold">{t('emptyChatTitle')}</h2>
                <p className="mt-2" style={{ color: 'var(--muted)' }}>{t('emptyChatDescription')}</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {[t('prompt1'), t('prompt2'), t('prompt3')].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-xl border p-3 text-left text-sm hover:border-green-600"
                      style={{ borderColor: 'var(--line)' }}
                      onClick={() => void sendMessage(prompt)}
                      disabled={!hasProvider || sending}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : active.messages.map((message, index) => (
              <article key={`${active.id}-${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[82%] ${message.role === 'user' ? 'bg-green-700 text-white' : 'border'}`} style={message.role === 'assistant' ? { borderColor: 'var(--line)', background: 'var(--bg)' } : undefined}>
                  <div className="mb-1 text-xs font-semibold opacity-75">
                    {message.role === 'user' ? t('you') : 'AgriVision'}
                    {message.createdAt && (
                      <time className="ml-2 font-normal" dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' })}
                      </time>
                    )}
                  </div>
                  {message.role === 'assistant' ? renderMarkdown(message.content) : (
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  )}
                  {message.role === 'assistant' && index === active.messages.length - 1 && (
                    <button type="button" className="mt-2 text-xs underline" onClick={() => void copyResponse(message.content)}>
                      {t('copy')}
                    </button>
                  )}
                </div>
              </article>
            ))}
            {sending && <p className="text-sm" role="status" style={{ color: 'var(--muted)' }}>{t('sending')}</p>}
            {error && (
              <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm" role="alert">
                <p>{error}</p>
                {lastUserMessage && lastMessage?.role === 'user' && hasProvider && (
                  <button type="button" className="mt-2 font-semibold underline" onClick={() => void sendMessage(lastUserMessage.content, true)}>
                    {t('retry')}
                  </button>
                )}
              </div>
            )}
            {storageError && <p className="text-sm text-amber-700" role="alert">{t('storageError')}</p>}
          </div>

          <form onSubmit={submit} className="border-t p-3 sm:p-4" style={{ borderColor: 'var(--line)' }}>
            <label className="sr-only" htmlFor="chat-input">{t('chatPlaceholder')}</label>
            <div className="flex items-end gap-2">
              <textarea
                id="chat-input"
                className="input min-h-[52px] resize-y"
                rows={2}
                maxLength={4000}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    submit(event)
                  }
                }}
                placeholder={t('chatPlaceholder')}
                disabled={!hasProvider || sending}
              />
              <button type="submit" className="btn-primary !px-4" disabled={!hasProvider || sending || !input.trim()}>
                {sending ? t('sending') : t('send')}
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>{t('inputHint')}</p>
          </form>
        </div>
      </div>
    </section>
  )
}
