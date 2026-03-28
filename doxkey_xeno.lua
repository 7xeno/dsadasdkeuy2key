-- ================================================
--   DoxKey System v2.0 - Script Xeno
-- ================================================
-- ANTES DE USAR:
--   1. Suba o projeto na Vercel
--   2. Copie a URL da Vercel (ex: https://doxkey.vercel.app)
--   3. Cole abaixo em SERVER_URL
-- ================================================

local Players      = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local HttpService  = game:GetService("HttpService")
local LocalPlayer  = Players.LocalPlayer

-- ⚠️ COLE A URL DA VERCEL AQUI
local SERVER_URL = "https://dsadasdkeuy2key.vercel.app/"

local NOME = "DoxKey System"
local VER  = "v2.0"

local function getHWID()
    local ok, id = pcall(function()
        return game:GetService("RbxAnalyticsService"):GetClientId()
    end)
    if ok and id and id ~= "" then return id end
    return "UID-" .. tostring(LocalPlayer.UserId)
end

local HWID = getHWID()

local function verificarKey(key)
    local url = SERVER_URL .. "/api/verificar?key=" .. key:upper():gsub("%s+","") .. "&hwid=" .. HWID
    local ok, resp = pcall(function()
        return HttpService:GetAsync(url, true)
    end)
    if not ok then return false, "sem_conexao" end
    local data = HttpService:JSONDecode(resp)
    return data.ok, data.motivo or ""
end

local function buildGUI()
    pcall(function() game.CoreGui:FindFirstChild("DoxKeyGUI"):Destroy() end)

    local sg = Instance.new("ScreenGui")
    sg.Name = "DoxKeyGUI"; sg.ResetOnSpawn = false
    sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    sg.Parent = game.CoreGui

    local overlay = Instance.new("Frame", sg)
    overlay.Size = UDim2.fromScale(1,1)
    overlay.BackgroundColor3 = Color3.new(0,0,0)
    overlay.BackgroundTransparency = 0.45
    overlay.BorderSizePixel = 0; overlay.ZIndex = 1

    local win = Instance.new("Frame", sg)
    win.Size = UDim2.new(0,360,0,240)
    win.Position = UDim2.new(0.5,-180,0.5,-150)
    win.BackgroundColor3 = Color3.fromRGB(8,8,8)
    win.BorderSizePixel = 0; win.ZIndex = 2
    Instance.new("UICorner",win).CornerRadius = UDim.new(0,12)
    local ws = Instance.new("UIStroke",win)
    ws.Color = Color3.fromRGB(35,35,35); ws.Thickness = 1

    local hdr = Instance.new("Frame",win)
    hdr.Size = UDim2.new(1,0,0,50)
    hdr.BackgroundColor3 = Color3.fromRGB(14,14,14)
    hdr.BorderSizePixel = 0; hdr.ZIndex = 3
    Instance.new("UICorner",hdr).CornerRadius = UDim.new(0,12)
    local hfix = Instance.new("Frame",hdr)
    hfix.Size = UDim2.new(1,0,0,12); hfix.Position = UDim2.new(0,0,1,-12)
    hfix.BackgroundColor3 = Color3.fromRGB(14,14,14)
    hfix.BorderSizePixel = 0; hfix.ZIndex = 3

    local ttl = Instance.new("TextLabel",hdr)
    ttl.Size=UDim2.new(1,-16,0,22); ttl.Position=UDim2.new(0,14,0,6)
    ttl.BackgroundTransparency=1; ttl.Text=NOME
    ttl.TextColor3=Color3.new(1,1,1); ttl.Font=Enum.Font.GothamBold
    ttl.TextSize=14; ttl.TextXAlignment=Enum.TextXAlignment.Left; ttl.ZIndex=4

    local sub = Instance.new("TextLabel",hdr)
    sub.Size=UDim2.new(1,-16,0,16); sub.Position=UDim2.new(0,14,0,28)
    sub.BackgroundTransparency=1
    sub.Text=VER.."  ·  HWID: "..HWID:sub(1,14).."..."
    sub.TextColor3=Color3.fromRGB(60,60,60); sub.Font=Enum.Font.Code
    sub.TextSize=10; sub.TextXAlignment=Enum.TextXAlignment.Left; sub.ZIndex=4

    local inst = Instance.new("TextLabel",win)
    inst.Size=UDim2.new(1,-20,0,18); inst.Position=UDim2.new(0,10,0,64)
    inst.BackgroundTransparency=1; inst.Text="cole sua key para continuar"
    inst.TextColor3=Color3.fromRGB(70,70,70); inst.Font=Enum.Font.Code
    inst.TextSize=11; inst.TextXAlignment=Enum.TextXAlignment.Left; inst.ZIndex=3

    local inp = Instance.new("TextBox",win)
    inp.Size=UDim2.new(1,-20,0,40); inp.Position=UDim2.new(0,10,0,86)
    inp.BackgroundColor3=Color3.new(0,0,0)
    inp.TextColor3=Color3.fromRGB(200,200,200)
    inp.PlaceholderText="DOXKEY-XXXXXXXX-XXXXXXXX"
    inp.PlaceholderColor3=Color3.fromRGB(45,45,45)
    inp.Font=Enum.Font.Code; inp.TextSize=12
    inp.ClearTextOnFocus=false; inp.Text=""; inp.ZIndex=3
    Instance.new("UICorner",inp).CornerRadius=UDim.new(0,8)
    local is=Instance.new("UIStroke",inp)
    is.Color=Color3.fromRGB(28,28,28); is.Thickness=1

    local status = Instance.new("TextLabel",win)
    status.Size=UDim2.new(1,-20,0,18); status.Position=UDim2.new(0,10,0,134)
    status.BackgroundTransparency=1; status.Text=""
    status.TextColor3=Color3.fromRGB(240,80,80); status.Font=Enum.Font.Code
    status.TextSize=11; status.TextXAlignment=Enum.TextXAlignment.Left; status.ZIndex=3

    local btn = Instance.new("TextButton",win)
    btn.Size=UDim2.new(1,-20,0,40); btn.Position=UDim2.new(0,10,0,190)
    btn.BackgroundColor3=Color3.new(1,1,1); btn.TextColor3=Color3.new(0,0,0)
    btn.Font=Enum.Font.GothamBold; btn.TextSize=13
    btn.Text="VERIFICAR KEY"; btn.AutoButtonColor=false; btn.ZIndex=3
    Instance.new("UICorner",btn).CornerRadius=UDim.new(0,8)

    btn.MouseEnter:Connect(function()
        TweenService:Create(btn,TweenInfo.new(0.12),{BackgroundColor3=Color3.fromRGB(220,220,220)}):Play()
    end)
    btn.MouseLeave:Connect(function()
        TweenService:Create(btn,TweenInfo.new(0.12),{BackgroundColor3=Color3.new(1,1,1)}):Play()
    end)

    TweenService:Create(win,TweenInfo.new(0.35,Enum.EasingStyle.Back),{
        Position=UDim2.new(0.5,-180,0.5,-120)
    }):Play()

    btn.MouseButton1Click:Connect(function()
        local digitada = inp.Text:upper():gsub("%s+","")
        if digitada=="" then
            status.Text="  insira uma key válida"
            status.TextColor3=Color3.fromRGB(240,80,80)
            return
        end

        btn.Text="verificando..."; btn.BackgroundColor3=Color3.fromRGB(180,180,180)
        status.Text="  verificando no servidor..."
        status.TextColor3=Color3.fromRGB(100,100,100)

        local valida, motivo = verificarKey(digitada)

        if valida then
            status.Text="  ✓ key aceita!"
            status.TextColor3=Color3.fromRGB(74,222,128)
            btn.Text="VERIFICAR KEY"
            btn.BackgroundColor3=Color3.new(1,1,1)
            task.wait(0.8)

            TweenService:Create(win,TweenInfo.new(0.25,Enum.EasingStyle.Back,Enum.EasingDirection.In),{
                Size=UDim2.new(0,360,0,0),
                Position=UDim2.new(0.5,-180,0.5,-150)
            }):Play()
            TweenService:Create(overlay,TweenInfo.new(0.25),{BackgroundTransparency=1}):Play()
            task.wait(0.3)
            sg:Destroy()

            pcall(function()
                game:GetService("StarterGui"):SetCore("SendNotification",{
                    Title="DoxKey System",
                    Text="Bem-vindo, "..LocalPlayer.Name.."!",
                    Duration=4,
                })
            end)

            print("[DoxKey] Autenticado! HWID: "..HWID)

            -- =============================================
            -- SEU SCRIPT AQUI
            -- =============================================


            -- =============================================

        else
            local msgs = {
                key_nao_encontrada="  key não encontrada",
                key_revogada="  key revogada",
                hwid_diferente="  key já usada em outro PC",
                sem_conexao="  sem conexão com servidor",
            }
            status.Text = msgs[motivo] or "  key inválida"
            status.TextColor3=Color3.fromRGB(240,80,80)
            btn.Text="VERIFICAR KEY"

            for i=1,5 do
                TweenService:Create(win,TweenInfo.new(0.04),{
                    Position=UDim2.new(0.5,-180+(i%2==0 and 10 or -10),0.5,-120)
                }):Play()
                task.wait(0.05)
            end
            TweenService:Create(win,TweenInfo.new(0.1),{
                Position=UDim2.new(0.5,-180,0.5,-120)
            }):Play()

            TweenService:Create(btn,TweenInfo.new(0.1),{BackgroundColor3=Color3.fromRGB(200,50,50)}):Play()
            task.wait(1)
            TweenService:Create(btn,TweenInfo.new(0.15),{BackgroundColor3=Color3.new(1,1,1)}):Play()
        end
    end)
end

buildGUI()
