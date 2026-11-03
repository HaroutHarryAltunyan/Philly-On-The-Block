import BagDrawer from "../components/shop/bag-drawer";
import ItemSheet from "../components/shop/item-sheet";
import { ShopProvider } from "../components/shop/shop-context";
import SiteFooter from "../components/site-footer";
import SiteHeader from "../components/site-header";
import { getStorefront } from "../../lib/storefront-server";
import "./site.css";

// Customer-facing pages: shared header, footer, bag, and product sheet. The
// live menu, hours, and fees are read on the server so prices are in the
// first HTML and the bag works on every page.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const storefront = await getStorefront();
  return (
    <ShopProvider initial={storefront}>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <BagDrawer />
      <ItemSheet />
    </ShopProvider>
  );
}
