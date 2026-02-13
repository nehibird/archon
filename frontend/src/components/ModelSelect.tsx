import { useEffect } from 'react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './ui/select'
import { useModelStore } from '../stores/modelStore'

export function ModelSelect() {
  const { selectedModel, models, isLoading, error, setSelectedModel, fetchModels } = useModelStore()

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Loading models..." />
        </SelectTrigger>
      </Select>
    )
  }

  if (error || models.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="No models available" />
        </SelectTrigger>
      </Select>
    )
  }

  const claudeModels = models.filter(m => m.provider === 'claude')
  const openRouterModels = models.filter(m => m.provider === 'openrouter')

  return (
    <Select value={selectedModel} onValueChange={setSelectedModel}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select a model">
          {models.find(m => m.id === selectedModel)?.label || selectedModel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {claudeModels.length > 0 && (
          <SelectGroup>
            <SelectLabel>Claude Code</SelectLabel>
            {claudeModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
          </SelectGroup>
        )}
        {openRouterModels.length > 0 && (
          <SelectGroup>
            <SelectLabel>OpenRouter</SelectLabel>
            {openRouterModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
