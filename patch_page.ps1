$path = "app\page.tsx"
$content = Get-Content $path -Raw -Encoding UTF8

$old = '        const tipoOrder = [''Diaria'',''Semanal'',''Mensual'',''Operativa'',''Táctica'',''Estratégica'',''Casa'']
        const ai = tipoOrder.indexOf(a.tipo), bi2 = tipoOrder.indexOf(b.tipo)
        if (ai !== bi2) return ai - bi2
      }
      return (a.orden ?? 0) - (b.orden ?? 0)'

$new = '        const tipoOrder = [''Diaria'',''Semanal'',''Mensual'',''Operativa'',''Táctica'',''Estratégica'',''Casa'']
        const ai = tipoOrder.indexOf(a.tipo), bi2 = tipoOrder.indexOf(b.tipo)
        if (ai !== bi2) return ai - bi2
      }
      return (a.orden ?? 0) - (b.orden ?? 0)'

# The actual fix: replace the Plan sort to respect orden as final tiebreaker
$old2 = '        if (aRetraso > 0 && bRetraso === 0) return -1
        if (bRetraso > 0 && aRetraso === 0) return 1
        if (aRetraso > 0 && bRetraso > 0 && bRetraso !== aRetraso) return bRetraso - aRetraso
        if (a.deadline === today2 && b.deadline !== today2 && bRetraso === 0) return -1
        if (b.deadline === today2 && a.deadline !== today2 && aRetraso === 0) return 1
        const tipoOrder = [''Diaria'',''Semanal'',''Mensual'',''Operativa'',''Táctica'',''Estratégica'',''Casa'']
        const ai = tipoOrder.indexOf(a.tipo), bi2 = tipoOrder.indexOf(b.tipo)
        if (ai !== bi2) return ai - bi2
      }
      return (a.orden ?? 0) - (b.orden ?? 0)'

$new2 = '        if (aRetraso > 0 && bRetraso === 0) return -1
        if (bRetraso > 0 && aRetraso === 0) return 1
        if (aRetraso > 0 && bRetraso > 0 && bRetraso !== aRetraso) return bRetraso - aRetraso
        if (a.deadline === today2 && b.deadline !== today2 && bRetraso === 0) return -1
        if (b.deadline === today2 && a.deadline !== today2 && aRetraso === 0) return 1
        // Same group — respect manual order
        return (a.orden ?? 0) - (b.orden ?? 0)
      }
      return (a.orden ?? 0) - (b.orden ?? 0)'

$content = $content.Replace($old2, $new2)
[System.IO.File]::WriteAllText((Resolve-Path $path).Path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Parcheado"
