import './globals.css';

export const metadata = {
  title: 'Meal Planner',
  description: 'Your weekly meal plan, built from your cravings, fridge, and groceries.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
