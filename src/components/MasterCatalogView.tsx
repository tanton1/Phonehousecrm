import React from 'react';
import { FundAccount, MasterCatalogItem, Partner, PurchaseOrder, StoreBranch, UserAccount, WarehouseInfo } from '../types';
import { CatalogCenterView } from './CatalogCenterView';

interface MasterCatalogViewProps {
  /** Legacy compatibility input. CatalogCenter loads its own paginated data. */
  items?: MasterCatalogItem[];
  currentUser?: UserAccount | null;
  partners?: Partner[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  funds?: FundAccount[];
  onAddPurchaseOrder?: (order: PurchaseOrder, autoCreateDevices: boolean) => Promise<PurchaseOrder | void> | PurchaseOrder | void;
  onAddPartner?: (partner: Partner) => Partner | void | Promise<Partner | void>;
}

export const MasterCatalogView: React.FC<MasterCatalogViewProps> = ({
  items = [],
  ...props
}) => {
  return <CatalogCenterView items={items} {...props} />;
};
