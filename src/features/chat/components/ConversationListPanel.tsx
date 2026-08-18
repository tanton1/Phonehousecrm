import React, { useState, useMemo } from 'react';
import { ChatConversation, ChatChannel } from '../types';
import { MessageSquare, Search, Facebook, MessageCircle, Video, Globe, Phone } from 'lucide-react';

export interface ConversationListPanelProps {
  conversations: ChatConversation[];
  selectedConversationId: string | null;
  onSelectConversation: (convo: ChatConversation) => void;
}

export const ConversationListPanel: React.FC<ConversationListPanelProps> = ({
  conversations,
  selectedConversationId,
  onSelectConversation
}) => {
  const [channelFilter, setChannelFilter] = useState<'ALL' | ChatChannel>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(c => {
      const matchChannel = channelFilter === 'ALL' || c.channel === channelFilter;
      const matchSearch =
        !q ||
        c.customerName.toLowerCase().includes(q) ||
        (c.customerPhone && c.customerPhone.includes(q)) ||
        c.lastMessageSnippet.toLowerCase().includes(q);

      return matchChannel && matchSearch;
    });
  }, [conversations, channelFilter, searchQuery]);

  const channelIcon = (channel: ChatChannel) => {
    switch (channel) {
      case 'FACEBOOK':
        return <Facebook className="w-3.5 h-3.5 text-blue-600" />;
      case 'ZALO':
        return <MessageCircle className="w-3.5 h-3.5 text-blue-500" />;
      case 'TIKTOK':
        return <Video className="w-3.5 h-3.5 text-zinc-900" />;
      default:
        return <Globe className="w-3.5 h-3.5 text-[#ff4b16]" />;
    }
  };

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl flex flex-col h-full overflow-hidden shadow-2xs">
      {/* 1. Header & Channel Tabs */}
      <div className="p-3.5 border-b border-zinc-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-[#ff4b16]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
              Hộp Thư Đa Kênh
            </h3>
          </div>
          {totalUnread > 0 && (
            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
              {totalUnread} chưa đọc
            </span>
          )}
        </div>

        {/* Channel Filter Chips */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-[11px] font-bold">
          <button
            onClick={() => setChannelFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
              channelFilter === 'ALL' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Tất Cả
          </button>
          <button
            onClick={() => setChannelFilter('FACEBOOK')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
              channelFilter === 'FACEBOOK' ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Facebook
          </button>
          <button
            onClick={() => setChannelFilter('ZALO')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
              channelFilter === 'ZALO' ? 'bg-blue-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Zalo
          </button>
          <button
            onClick={() => setChannelFilter('TIKTOK')}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
              channelFilter === 'TIKTOK' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            TikTok
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm tên khách, SĐT, tin nhắn..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-[#ff4b16]"
          />
        </div>
      </div>

      {/* 2. Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 min-h-[300px]">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-xs">
            Không có hội thoại nào phù hợp.
          </div>
        ) : (
          filteredConversations.map(convo => {
            const isSelected = selectedConversationId === convo.id;

            return (
              <div
                key={convo.id}
                onClick={() => onSelectConversation(convo)}
                className={`p-3 transition-colors cursor-pointer flex items-start space-x-3 relative ${
                  isSelected ? 'bg-orange-50/80 border-r-2 border-[#ff4b16]' : 'hover:bg-zinc-50'
                }`}
              >
                {/* Avatar & Channel Icon */}
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-zinc-200 to-zinc-300 flex items-center justify-center font-bold text-zinc-700 text-xs shadow-2xs">
                    {convo.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-1 -right-1 p-0.5 bg-white rounded-full shadow-2xs">
                    {channelIcon(convo.channel)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-zinc-900 truncate max-w-[130px]">
                      {convo.customerName}
                    </h4>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {convo.lastMessageTime}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {convo.lastMessageSnippet}
                  </p>

                  {convo.interestedModel && (
                    <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600">
                      {convo.interestedModel}
                    </span>
                  )}
                </div>

                {/* Unread dot */}
                {convo.unreadCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#ff4b16] shrink-0 mt-1" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
