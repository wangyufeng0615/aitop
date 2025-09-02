# cctop

A simple web monitoring tools for Claude Code sessions.

If you work with multiple Claude Code sessions, this tool helps you monitor their status and get finished notifications.

## Usage

```bash
git clone https://github.com/wangyufeng0615/cctop.git
cd cctop
npx cctop
```

cctop will automatically find an available port and open your browser. I usually move this tab to side screen.

**Please start cctop FIRST** before you open Claude Code, for full features.

## How it works

cctop monitors Claude Code session's status through three ways:

1. **Hook server** - Registers Claude Code hooks to POST events to cctop's local HTTP endpoint
2. **Log monitoring** - Watches `~/.claude/projects/../*.jsonl` for events
3. **PID tracking** - Tracks PIDs

Based on these methods, cctop determines whether each session is running, idle or closed. This multi-method is necessary for now and I tried my best.

## About Security

- **Log Reading**: cctop reads Claude Code logs from `~/.claude/` to detect specific keywords like "interrupted" for session status monitoring
- **Hook Registration**: cctop updates `~/.claude/settings.json` to add HTTP hook commands that POST JSON to `http://127.0.0.1:<port>/api/hooks/*` (no temporary files under home directory)
- **State**: Session state is kept in memory only; nothing is written to disk
- **Privacy**: cctop does not store any user information and has no internet connectivity features
- **Permissions**: Aside from updating `~/.claude/settings.json` to register hooks, cctop does not modify Claude Code files or require elevated privileges

## Contributing

Welcome for all kind of issues or pull requests.

## License

MIT
