import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ChatbotMenuOption {
  id: string;
  menu_id: string;
  parent_id?: string;
  account_id: string;
  label: string;
  response_text: string;
  route_to_department?: string;
  order_index: number;
  is_leaf: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatbotMenu {
  id: string;
  account_id: string;
  name: string;
  description?: string;
  welcome_message: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useChatbotMenus() {
  const supabase = createClient();

  const fetchMenus = useCallback(
    async (accountId: string): Promise<ChatbotMenu[]> => {
      const { data, error } = await supabase
        .from('chatbot_menus')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ChatbotMenu[];
    },
    [supabase]
  );

  const fetchMenuOptions = useCallback(
    async (menuId: string, parentId?: string): Promise<ChatbotMenuOption[]> => {
      let query = supabase
        .from('chatbot_menu_options')
        .select('*')
        .eq('menu_id', menuId);

      if (parentId === undefined) {
        query = query.is('parent_id', null);
      } else {
        query = query.eq('parent_id', parentId);
      }

      const { data, error } = await query.order('order_index');

      if (error) throw error;
      return (data ?? []) as ChatbotMenuOption[];
    },
    [supabase]
  );

  const createMenu = useCallback(
    async (
      accountId: string,
      name: string,
      welcomeMessage: string
    ): Promise<ChatbotMenu> => {
      const { data, error } = await supabase
        .from('chatbot_menus')
        .insert({
          account_id: accountId,
          name,
          welcome_message: welcomeMessage,
          active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ChatbotMenu;
    },
    [supabase]
  );

  const addOption = useCallback(
    async (
      menuId: string,
      accountId: string,
      label: string,
      responseText: string,
      isLeaf: boolean,
      routeToDepartment?: string,
      parentId?: string,
      orderIndex?: number
    ): Promise<ChatbotMenuOption> => {
      const { data, error } = await supabase
        .from('chatbot_menu_options')
        .insert({
          menu_id: menuId,
          parent_id: parentId,
          account_id: accountId,
          label,
          response_text: responseText,
          route_to_department: routeToDepartment,
          order_index: orderIndex ?? 0,
          is_leaf: isLeaf,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ChatbotMenuOption;
    },
    [supabase]
  );

  const deleteOption = useCallback(
    async (optionId: string) => {
      const { error } = await supabase
        .from('chatbot_menu_options')
        .delete()
        .eq('id', optionId);

      if (error) throw error;
    },
    [supabase]
  );

  return {
    fetchMenus,
    fetchMenuOptions,
    createMenu,
    addOption,
    deleteOption,
  };
}
