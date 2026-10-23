import { App } from "../../components/App";

// Google and Microsoft send the user back here after they allow access to their Drive/OneDrive.
export default function CloudCallback() {
  return <App />;
}
