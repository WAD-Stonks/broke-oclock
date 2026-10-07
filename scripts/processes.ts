import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { setTimeout } from 'node:timers/promises'

interface Command {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

const signalExitCode = (signal: NodeJS.Signals) => 128 + constants.signals[signal]

// Own a process group on POSIX so pnpm's shells/watchers cannot outlive the runner.
// Windows falls back to direct child signalling; POSIX is the supported dev/CI host.
export const runCommands = async (commands: Command[]): Promise<number> => {
  if (commands.length === 0) throw new Error('At least one command is required')
  const grouped = process.platform !== 'win32'
  const children = commands.map(({ command, args, cwd, env }) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', detached: grouped })
    let spawnFailure = 0
    const exited = new Promise<number>((resolve) => {
      child.once('error', (error: NodeJS.ErrnoException) => {
        console.error(`Cannot start ${command}: ${error.message}`)
        spawnFailure = error.code === 'ENOENT' ? 127 : 1
      })
      child.once('close', (code, signal) => {
        resolve(spawnFailure || (signal ? signalExitCode(signal) : (code ?? 1)))
      })
    })
    const send = (signal: NodeJS.Signals) => {
      if (!child.pid) return
      try {
        if (grouped) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
    const alive = () => {
      if (!child.pid) return false
      if (!grouped) return child.exitCode === null && child.signalCode === null
      try {
        process.kill(-child.pid, 0)
        return true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
        throw error
      }
    }
    return { exited, send, alive }
  })
  let shutdown: Promise<void> | undefined
  let interruptedCode: number | undefined
  const stop = (signal: NodeJS.Signals) => {
    if (shutdown) return shutdown
    shutdown = (async () => {
      for (const child of children) child.send(signal)
      const deadline = Date.now() + 3_000
      while (children.some((child) => child.alive()) && Date.now() < deadline) await setTimeout(30)
      for (const child of children) if (child.alive()) child.send('SIGKILL')
    })()
    return shutdown
  }
  const interrupt = () => {
    interruptedCode ??= signalExitCode('SIGINT')
    void stop('SIGINT')
  }
  const terminate = () => {
    interruptedCode ??= signalExitCode('SIGTERM')
    void stop('SIGTERM')
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    const first = await Promise.race(children.map((child) => child.exited))
    await stop('SIGTERM')
    await Promise.all(children.map((child) => child.exited))
    return interruptedCode ?? first
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}
