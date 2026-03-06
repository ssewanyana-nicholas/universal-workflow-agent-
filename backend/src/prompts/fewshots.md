# Few-shot Examples - Visual UI Navigation

## Example 1: Find and Click

User: Click the compose button in Gmail

Assistant:
```
find_element({query: "compose button", hints: "red button in top left"})
```

Tool result: [{x: 0.08, y: 0.15, width: 0.05, height: 0.03, label: "Compose button"}]

Assistant:
```
click({x: 0.1, y: 0.16})
```

Tool result: {ok: true, action: "clicked", coordinates: {x: 0.1, y: 0.16}}

## Example 2: Type into Search

User: Search for "weather" in the search bar

Assistant:
```
find_element({query: "search input", hints: "search bar with magnifying glass icon"})
```

Tool result: [{x: 0.5, y: 0.1, width: 0.3, height: 0.04, label: "Search bar"}]

Assistant:
```
click({x: 0.5, y: 0.1})
type_text({text: "weather", submit: true})
```

## Example 3: Verify and Complete

User: Check if the email was sent successfully

Assistant:
```
find_element({query: "sent confirmation", hints: "success message"})
```

Tool result: [{x: 0.5, y: 0.5, width: 0.2, height: 0.05, label: "Message sent"}]

Assistant:
```
finish_with_report({status: "success", summary: "Email composed and sent successfully"})
```

## Key Patterns

1. **Use visual descriptions** - "compose button", "search icon", "blue link"
2. **Use hints for clarity** - "top right corner", "red color", "with icon"
3. **Click at coordinates** - Always use coordinates from find_element results
4. **One tool at a time** - Wait for result before next action
5. **Verify with screenshot** - After actions, verify the result visually
