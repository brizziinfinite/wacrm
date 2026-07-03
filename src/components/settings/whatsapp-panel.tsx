'use client'

import { WhatsAppConfig } from './whatsapp-config'
import { WhatsappPhoneMappingsSettings } from './whatsapp-phone-mappings-settings'
import { SettingsPanelHead } from './settings-panel-head'

export function WhatsAppPanel() {
  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="WhatsApp & Routing"
        description="Configure your WhatsApp integration and set up phone number routing for centralized messaging"
      />

      {/* Main WhatsApp config */}
      <div>
        <WhatsAppConfig />
      </div>

      {/* Phone mappings for centralized routing */}
      <div>
        <WhatsappPhoneMappingsSettings />
      </div>
    </div>
  )
}
