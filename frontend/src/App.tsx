import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { TMDBMovie, FavoriteItem } from "./types";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { fetchTomHanksMovies } from "./api/tmdb";
import { getFavoritesApi, addFavoriteApi, deleteFavoriteApi, getUserProfileApi, verifyStripeSessionApi } from "./api/backend";

import { Navbar } from "./components/Navbar";
import { MovieCard } from "./components/MovieCard";
import { MovieDetailsModal } from "./components/MovieDetailsModal";
import { AdminCommentsModal } from "./components/AdminCommentsModal";
import { PremiumModal } from "./components/PremiumModal";
import { AuthPage } from "./components/AuthPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { Toast, type ToastMessage } from "./components/Toast";
import { ProfilePage } from "./components/ProfilePage";

import { Film, Clapperboard, Heart, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 8;

function getPageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | string)[] = [1];

  if (currentPage > 3) {
    pages.push("...");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push("...");
  }

  pages.push(totalPages);

  return pages;
}

interface MainCatalogProps {
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

const MainCatalog: React.FC<MainCatalogProps> = ({ showToast }) => {
  const { token, isAuthenticated, refreshSession, updateUser } = useAuth();

  const [currentView, setCurrentView] = useState<"catalog" | "profile">("catalog");
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoadingMovies, setIsLoadingMovies] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedMovie, setSelectedMovie] = useState<TMDBMovie | null>(null);
  const [favoritingMovieIds, setFavoritingMovieIds] = useState<Set<number>>(new Set());
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  // Check URL parameters for Stripe Checkout status
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const stripeStatus = query.get("stripe_status");

    if (stripeStatus === "success" || stripeStatus === "success_mock") {
      const sessionId = query.get("session_id");
      if (token) {
        verifyStripeSessionApi(token, sessionId)
          .then((data) => {
            if (data.user) {
              updateUser({ isPremium: data.user.isPremium, ...data.user });
              showToast("success", "🎉 Parabéns! Sua assinatura do Plano Premium foi ativada com sucesso!");
            }
          })
          .catch((err) => {
            console.error("Erro ao verificar sessão do Stripe:", err);
            getUserProfileApi(token).then((u) => {
              updateUser({ isPremium: u.isPremium, ...u });
            }).catch(() => {});
          });
      } else {
        showToast("success", "🎉 Parabéns! Sua assinatura do Plano Premium foi ativada!");
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (stripeStatus === "cancel") {
      showToast("info", "Fluxo de pagamento com o Stripe cancelado. Você continua no Plano Gratuito.");
      if (token) {
        getUserProfileApi(token).then((u) => {
          updateUser({ isPremium: u.isPremium, ...u });
        }).catch(() => {});
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (stripeStatus === "manage_mock") {
      showToast("info", "Você já possui uma assinatura do Plano Premium ativa.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [token, updateUser, showToast]);

  // Load Movies from TMDB
  const loadMovies = useCallback(async () => {
    setIsLoadingMovies(true);
    setApiError(null);
    try {
      const data = await fetchTomHanksMovies();
      setMovies(data);
    } catch (err: any) {
      console.error("Erro ao carregar filmes:", err);
      const msg = err.message || "Erro ao carregar catálogo de filmes do TMDB.";
      setApiError(msg);
      setMovies([]);
    } finally {
      setIsLoadingMovies(false);
    }
  }, []);

  // Load User Favorites from Backend
  const loadFavorites = useCallback(async () => {
    if (!token) {
      setFavorites([]);
      return;
    }
    try {
      const favList = await getFavoritesApi(token);
      setFavorites(favList);
    } catch (err: any) {
      console.error("Erro ao carregar favoritos do usuário:", err);
      if (err.message && (err.message.includes("Token invalid") || err.message.includes("401"))) {
        const newToken = await refreshSession();
        if (newToken) {
          try {
            const favList = await getFavoritesApi(newToken);
            setFavorites(favList);
          } catch { }
        }
      }
    }
  }, [token, refreshSession]);

  useEffect(() => {
    if (isAuthenticated) {
      loadMovies();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && token) {
      loadFavorites();
    }
  }, [isAuthenticated, token, loadFavorites]);

  // Reset page when search or view filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showOnlyFavorites]);

  // Favorite toggle handler
  const handleToggleFavorite = async (movie: TMDBMovie) => {
    if (!isAuthenticated || !token) return;
    if (favoritingMovieIds.has(movie.id)) return;

    setFavoritingMovieIds((prev) => new Set(prev).add(movie.id));

    const existingFav = favorites.find((f) => f.tmdbMovieId === movie.id);

    try {
      if (existingFav) {
        // Remove favorite
        const favIdToDelete = existingFav.id || movie.id;
        await deleteFavoriteApi(token, favIdToDelete);
        setFavorites((prev) => prev.filter((f) => f.tmdbMovieId !== movie.id));
        showToast("success", `"${movie.title}" removido dos favoritos.`);
      } else {
        // Add favorite
        const newFav = await addFavoriteApi(
          token,
          movie.id,
          movie.title,
          movie.poster_path
        );
        if (newFav) {
          setFavorites((prev) => {
            const filtered = prev.filter((f) => f.tmdbMovieId !== movie.id);
            return [...filtered, newFav];
          });
        }
        showToast("success", `"${movie.title}" adicionado aos favoritos!`);
      }
    } catch (err: any) {
      if (err.message && err.message.includes("Plano Gratuito")) {
        showToast("error", err.message);
        setIsPremiumModalOpen(true);
      } else {
        showToast("error", err.message || "Erro ao atualizar favoritos.");
      }
    } finally {
      setFavoritingMovieIds((prev) => {
        const next = new Set(prev);
        next.delete(movie.id);
        return next;
      });
    }
  };

  // Map favorite status for quick lookup
  const favoriteMovieIds = useMemo(() => {
    return new Set(favorites.map((f) => f.tmdbMovieId));
  }, [favorites]);

  // Filter movies by search term & favorites filter
  const filteredMovies = useMemo(() => {
    return movies.filter((movie) => {
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        movie.title.toLowerCase().includes(query) ||
        (movie.original_title && movie.original_title.toLowerCase().includes(query)) ||
        (movie.character && movie.character.toLowerCase().includes(query)) ||
        (movie.release_date && movie.release_date.includes(query));

      const matchesFavorite = !showOnlyFavorites || favoriteMovieIds.has(movie.id);

      return matchesSearch && matchesFavorite;
    });
  }, [movies, searchTerm, showOnlyFavorites, favoriteMovieIds]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredMovies.length / ITEMS_PER_PAGE) || 1;
  const paginatedMovies = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMovies.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMovies, currentPage]);

  return (
    <div className="app-container">
      <Navbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        showOnlyFavorites={showOnlyFavorites}
        setShowOnlyFavorites={setShowOnlyFavorites}
        favoritesCount={favorites.length}
        openAuthModal={() => { }}
        openAdminModal={() => setIsAdminModalOpen(true)}
        openPremiumModal={() => setIsPremiumModalOpen(true)}
        onProfileClick={() => setCurrentView("profile")}
        onBrandClick={() => setCurrentView("catalog")}
        currentView={currentView}
      />

      <main className="main-content">
        {currentView === "profile" ? (
          <ProfilePage
            favorites={favorites}
            movies={movies}
            favoritingMovieIds={favoritingMovieIds}
            onToggleFavorite={handleToggleFavorite}
            onSelectMovie={(m) => setSelectedMovie(m)}
            onBackToCatalog={() => setCurrentView("catalog")}
            showToast={showToast}
            openPremiumModal={() => setIsPremiumModalOpen(true)}
          />
        ) : (
          <>
            {/* Section Header Controls */}
            <div className="section-header-row">
              <h2 className="section-title">
                {showOnlyFavorites ? (
                  <>
                    <Heart className="fill-heart" size={24} style={{ color: "#e50914" }} />
                    <span>Meus Filmes Favoritos</span>
                  </>
                ) : (
                  <>
                    <Clapperboard size={24} style={{ color: "#f5c518" }} />
                    <span>Catálogo de Filmes</span>
                  </>
                )}
              </h2>

              <span className="results-count">
                Exibindo <strong>{filteredMovies.length}</strong> {filteredMovies.length === 1 ? "filme" : "filmes"}
              </span>
            </div>

            {/* Catalog Grid State */}
            {isLoadingMovies ? (
              <div className="catalog-loading">
                <RefreshCw className="spinning-icon" size={32} />
                <span>Carregando catálogo de filmes do Tom Hanks via TMDB API...</span>
              </div>
            ) : apiError ? (
              <div className="catalog-empty">
                <div className="empty-icon-wrapper" style={{ background: "rgba(229, 9, 20, 0.1)", color: "#e50914" }}>
                  <AlertTriangle size={32} />
                </div>
                <h3>Erro ao Carregar Catálogo</h3>
                <p style={{ maxWidth: "600px", margin: "0 auto 1.5rem auto", lineHeight: "1.6" }}>
                  {apiError}
                </p>
                <button className="btn btn-primary" onClick={loadMovies} style={{ marginTop: "1rem" }}>
                  <RefreshCw size={16} style={{ marginRight: "0.5rem" }} />
                  Tentar Novamente
                </button>
              </div>
            ) : filteredMovies.length === 0 ? (
              <div className="catalog-empty">
                <div className="empty-icon-wrapper">
                  <Film size={32} />
                </div>
                <h3>Nenhum filme encontrado</h3>
                <p>
                  {showOnlyFavorites
                    ? "Você ainda não adicionou nenhum filme aos favoritos."
                    : `Nenhum resultado corresponde à busca por "${searchTerm}".`}
                </p>
              </div>
            ) : (
              <>
                <div className="movie-grid">
                  {paginatedMovies.map((movie) => (
                    <MovieCard
                      key={movie.id}
                      movie={movie}
                      isFavorite={favoriteMovieIds.has(movie.id)}
                      isFavoriting={favoritingMovieIds.has(movie.id)}
                      favoriteItem={favorites.find((f) => f.tmdbMovieId === movie.id)}
                      onToggleFavorite={handleToggleFavorite}
                      onSelectMovie={(m) => setSelectedMovie(m)}
                    />
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="pagination-container">
                    <button
                      className="pagination-btn"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      title="Página Anterior"
                    >
                      <ChevronLeft size={18} />
                      <span>Anterior</span>
                    </button>

                    <div className="pagination-numbers">
                      {getPageNumbers(currentPage, totalPages).map((item, index) => {
                        if (typeof item === "string") {
                          return (
                            <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                              ...
                            </span>
                          );
                        }
                        return (
                          <button
                            key={item}
                            className={`pagination-number ${item === currentPage ? "active" : ""}`}
                            onClick={() => setCurrentPage(item)}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      className="pagination-btn"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      title="Próxima Página"
                    >
                      <span>Próximo</span>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          <Film size={16} /> Kreato • Desenvolvido por Guilherme Dias
        </p>
      </footer>

      {/* Movie Details Modal */}
      <MovieDetailsModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
        isFavorite={selectedMovie ? favoriteMovieIds.has(selectedMovie.id) : false}
        isFavoriting={selectedMovie ? favoritingMovieIds.has(selectedMovie.id) : false}
        onToggleFavorite={handleToggleFavorite}
        showToast={showToast}
        openAuthModal={() => { }}
        openPremiumModal={() => setIsPremiumModalOpen(true)}
      />

      {/* Admin Moderation Modal */}
      <AdminCommentsModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        moviesList={movies}
        showToast={showToast}
      />

      {/* Premium Subscription Modal */}
      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        showToast={showToast}
      />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((type: "success" | "error" | "info", text: string) => {
    setToast({ id: Date.now().toString(), type, text });
  }, []);

  const isResetRoute =
    window.location.pathname.includes("reset-password") ||
    window.location.search.includes("token=");

  if (isResetRoute) {
    return (
      <>
        <ResetPasswordPage
          showToast={showToast}
          onGoToLogin={() => {
            window.location.href = "/";
          }}
        />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="catalog-loading" style={{ minHeight: "100vh" }}>
        <RefreshCw className="spinning-icon" size={36} />
        <span>Verificando autenticação...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthPage showToast={showToast} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  return (
    <>
      <MainCatalog showToast={showToast} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
