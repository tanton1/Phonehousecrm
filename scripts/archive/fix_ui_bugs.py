import re

# Fix SalesWorkspaceView
file_path = 'src/components/SalesWorkspaceView.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to remove the extraneous WORKSPACE AREA and buttons
# Between `<div className="flex-1 flex overflow-hidden">` and the second `{/* WORKSPACE AREA */}`
pattern = r'\{/\* WORKSPACE AREA \*/\}\s*<div className="flex-1 flex overflow-hidden">\s*<button.*?</button>\s*</div>\s*\{/\* WORKSPACE AREA \*/\}'
content = re.sub(pattern, '{/* WORKSPACE AREA */}', content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

# Fix TechWorkspaceView
file_path2 = 'src/components/TechWorkspaceView.tsx'
with open(file_path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

pattern2 = r'\{/\* MAIN CONTENT AREA \*/\}\s*<div className="flex-1 overflow-auto bg-zinc-50/50 p-4">\s*<div className="flex-1 p-2 space-y-1">.*?</div>\s*</div>\s*\{/\* MAIN CONTENT AREA \*/\}'
content2 = re.sub(pattern2, '{/* MAIN CONTENT AREA */}', content2, flags=re.DOTALL)

with open(file_path2, 'w', encoding='utf-8') as f:
    f.write(content2)

print("UI bugs fixed.")
